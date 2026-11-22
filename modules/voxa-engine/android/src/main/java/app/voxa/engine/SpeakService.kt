package app.voxa.engine

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.SystemClock
import android.util.Log

/**
 * Speak for me while it plays: a media notification and a MediaSession, so the script shows in the
 * notification shade, on the lock screen and in the quick-settings media player, with play/pause,
 * back and forward 15 seconds, Stop and a seek bar. It also keeps Voxa allowed to play with the
 * screen off (foreground service of type mediaPlayback).
 *
 * Like ListenService it plays nothing itself: buttons go to the app as onSpeakAction events, the
 * app does the work and sends the new state back. While paused the service stays up, so Play on the
 * lock screen works with the app in the background.
 */
class SpeakService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action
    if (action != null && action.startsWith(PREFIX)) {
      val handler = onAction
      if (handler == null && instance == null) stopSelf() else handler?.invoke(action.removePrefix(PREFIX), -1.0)
      return START_NOT_STICKY
    }
    instance = this
    ensureChannel(this)
    val notification = build(this, notice)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  /** What the notification and the lock screen show. */
  data class Notice(
    val title: String,
    val subtitle: String = "",
    val playing: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
  )

  companion object {
    private const val CHANNEL = "voxa-speak"
    private const val NOTIFICATION_ID = 4202
    private const val PREFIX = "app.voxa.speak."
    private const val ACCENT = 0xFFD63F1C.toInt()

    @Volatile private var instance: SpeakService? = null
    @Volatile private var notice = Notice("Speak for me")
    private var session: MediaSession? = null

    /** Set by VoxaEngineModule: receives play, pause, back, forward, stop, or seek with positionMs. */
    @Volatile var onAction: ((String, Double) -> Unit)? = null

    private fun ensureChannel(context: Context) {
      val channel = NotificationChannel(CHANNEL, "Speak for me", NotificationManager.IMPORTANCE_LOW).apply {
        description = "What Voxa is reading, with play and pause"
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun session(context: Context): MediaSession {
      session?.let { return it }
      val s = MediaSession(context.applicationContext, "voxa-speak")
      s.setCallback(object : MediaSession.Callback() {
        override fun onPlay() { onAction?.invoke("play", -1.0) }
        override fun onPause() { onAction?.invoke("pause", -1.0) }
        override fun onStop() { onAction?.invoke("stop", -1.0) }
        override fun onRewind() { onAction?.invoke("back", -1.0) }
        override fun onFastForward() { onAction?.invoke("forward", -1.0) }
        override fun onSkipToPrevious() { onAction?.invoke("back", -1.0) }
        override fun onSkipToNext() { onAction?.invoke("forward", -1.0) }
        override fun onSeekTo(pos: Long) { onAction?.invoke("seek", pos.toDouble()) }
        override fun onCustomAction(action: String, extras: Bundle?) { onAction?.invoke(action, -1.0) }
      })
      // Opening the session's controls (lock screen, quick settings) brings Voxa's Player back.
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        s.setSessionActivity(PendingIntent.getActivity(context, 1, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      }
      session = s
      return s
    }

    private fun updateSession(context: Context, n: Notice) {
      val s = session(context)
      s.setMetadata(
        MediaMetadata.Builder()
          .putString(MediaMetadata.METADATA_KEY_TITLE, n.title)
          .putString(MediaMetadata.METADATA_KEY_ARTIST, n.subtitle)
          .putLong(MediaMetadata.METADATA_KEY_DURATION, n.durationMs)
          .build(),
      )
      // Android 13+ draws the lock-screen and quick-settings buttons from these: play/pause, the two
      // custom 15-second skips (in the previous/next slots) and the seek bar.
      s.setPlaybackState(
        PlaybackState.Builder()
          .setActions(
            PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
              PlaybackState.ACTION_STOP or PlaybackState.ACTION_SEEK_TO or PlaybackState.ACTION_REWIND or PlaybackState.ACTION_FAST_FORWARD,
          )
          .addCustomAction(PlaybackState.CustomAction.Builder("back", "Back 15 seconds", android.R.drawable.ic_media_rew).build())
          .addCustomAction(PlaybackState.CustomAction.Builder("forward", "Forward 15 seconds", android.R.drawable.ic_media_ff).build())
          // The system moves the position on by itself while playing.
          .setState(if (n.playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, n.positionMs, if (n.playing) 1f else 0f, SystemClock.elapsedRealtime())
          .build(),
      )
      s.isActive = true
    }

    private fun build(context: Context, n: Notice): Notification {
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?.let { PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
      val b = Notification.Builder(context, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
        .setContentTitle(n.title)
        .setContentText(n.subtitle)
        .setColor(ACCENT)
        .setContentIntent(open)
        .setOngoing(n.playing)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setCategory(Notification.CATEGORY_TRANSPORT)
        // Swiping it away while paused ends the session, as with music apps.
        .setDeleteIntent(pending(context, "stop"))
        // Only the script's first words show; they are what the person chose to say aloud.
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .addAction(action(context, "back", "Back 15 seconds", android.R.drawable.ic_media_rew))
        .addAction(
          if (n.playing) action(context, "pause", "Pause", android.R.drawable.ic_media_pause)
          else action(context, "play", "Play", android.R.drawable.ic_media_play),
        )
        .addAction(action(context, "forward", "Forward 15 seconds", android.R.drawable.ic_media_ff))
        .addAction(action(context, "stop", "Stop", android.R.drawable.ic_menu_close_clear_cancel))
        .setStyle(Notification.MediaStyle().setMediaSession(session(context).sessionToken).setShowActionsInCompactView(0, 1, 2))
      return b.build()
    }

    private fun pending(context: Context, name: String): PendingIntent {
      val intent = Intent(context, SpeakService::class.java).setAction(PREFIX + name)
      return PendingIntent.getService(context, 100 + name.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun action(context: Context, name: String, label: String, icon: Int): Notification.Action =
      Notification.Action.Builder(Icon.createWithResource(context, icon), label, pending(context, name)).build()

    /** Shows a new state: updates in place, or starts the service when it is not running. */
    fun update(context: Context, n: Notice) {
      notice = n
      updateSession(context, n)
      val s = instance
      if (s != null) {
        try {
          context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(s, n))
        } catch (e: Throwable) {
          Log.w("VoxaSpeak", "could not update the notification", e)
        }
      } else {
        context.startForegroundService(Intent(context, SpeakService::class.java))
      }
    }

    /** Playback ended: remove the notification and the lock-screen controls. */
    fun stop(context: Context) {
      context.stopService(Intent(context, SpeakService::class.java))
      session?.let {
        it.isActive = false
        it.release()
      }
      session = null
    }
  }
}
