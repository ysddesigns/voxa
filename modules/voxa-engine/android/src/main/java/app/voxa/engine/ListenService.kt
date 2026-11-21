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
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Keeps Voxa allowed to use the microphone while the screen is off or another app is open.
 * Android requires a foreground service of type "microphone" with a visible notification for that.
 * The service does no listening itself: the listening thread runs in VoxaEngineModule.
 *
 * During a Listen session the notification is Voxa's Android counterpart of the iOS Live Activity:
 * a running timer, listening or paused, Pause/Resume, Mark and Stop buttons, and (only when the
 * person turns it on) the latest sentence, which is hidden on the lock screen. The buttons are sent
 * to the app as onListenAction events; the app does the work and sends the new state back.
 *
 * The service stays up while a session is paused, so Resume works from the notification with the
 * app in the background (Android does not let a background app start using the microphone).
 */
class ListenService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action
    if (action != null && action in ACTIONS) {
      // A notification button. If the app is gone, there is nothing to control: close up.
      val handler = onAction
      if (handler == null && instance == null) stopSelf() else handler?.invoke(action.removePrefix(PREFIX))
      return START_NOT_STICKY
    }
    instance = this
    getSystemService(NotificationManager::class.java)
      .createNotificationChannel(NotificationChannel(CHANNEL, "Listening", NotificationManager.IMPORTANCE_LOW))
    val notification = build(notice)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    holdWakeLock(!notice.paused)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    holdWakeLock(false)
    if (instance === this) instance = null
    super.onDestroy()
  }

  private fun show(n: Notice) {
    try {
      getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(n))
    } catch (e: Throwable) {
      Log.w("VoxaListen", "could not update the notification", e)
    }
    holdWakeLock(!n.paused)
  }

  /** Keeps the CPU running with the screen off while listening, so speech is decoded as it arrives. Not while paused. */
  private fun holdWakeLock(on: Boolean) {
    if (on && wakeLock == null) {
      wakeLock = getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "voxa:listen")
        .apply {
          setReferenceCounted(false)
          acquire(MAX_HOLD_MS)
        }
    } else if (!on) {
      wakeLock?.let { if (it.isHeld) it.release() }
      wakeLock = null
    }
  }

  private fun build(n: Notice): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)
      ?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val b = Notification.Builder(this, CHANNEL)
      // A plain system icon: adaptive app icons are not allowed as small notification icons.
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(n.title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_STATUS)
      .setContentIntent(open)
    if (n.paused) {
      b.setUsesChronometer(false)
        .setShowWhen(false)
        .setContentText("Paused at ${clock(n.elapsedMs)} · microphone off")
    } else {
      // The system counts the timer up by itself; the app only updates on changes.
      b.setUsesChronometer(true)
        .setShowWhen(true)
        .setWhen(System.currentTimeMillis() - n.elapsedMs)
        .setContentText(n.caption.ifBlank { if (n.actions) "Listening · microphone on" else "The microphone is on. Open Voxa to stop." })
    }
    if (n.caption.isNotBlank() && !n.paused) {
      b.setStyle(Notification.BigTextStyle().bigText(n.caption))
      // Words someone said stay off the lock screen: it shows the timer and buttons only.
      b.setVisibility(Notification.VISIBILITY_PRIVATE)
      b.setPublicVersion(build(n.copy(caption = "")))
    } else {
      b.setVisibility(Notification.VISIBILITY_PUBLIC)
    }
    if (n.actions) {
      if (n.paused) b.addAction(action("resume", "Resume", android.R.drawable.ic_media_play))
      else b.addAction(action("pause", "Pause", android.R.drawable.ic_media_pause))
      b.addAction(action("mark", "Mark", android.R.drawable.star_on))
      b.addAction(action("stop", "Stop", android.R.drawable.ic_menu_close_clear_cancel))
    }
    return b.build()
  }

  private fun action(name: String, label: String, icon: Int): Notification.Action {
    val intent = Intent(this, ListenService::class.java).setAction(PREFIX + name)
    val pi = PendingIntent.getService(this, name.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return Notification.Action.Builder(Icon.createWithResource(this, icon), label, pi).build()
  }

  /** What the notification shows. actions = false for the screen-off test, which has no buttons. */
  data class Notice(
    val title: String,
    val paused: Boolean = false,
    val elapsedMs: Long = 0,
    val caption: String = "",
    val actions: Boolean = false,
  )

  companion object {
    private const val CHANNEL = "voxa-listen"
    private const val NOTIFICATION_ID = 4201
    private const val PREFIX = "app.voxa.listen."
    private val ACTIONS = setOf("pause", "resume", "mark", "stop").map { PREFIX + it }.toSet()
    /** Safety limit: the wake lock is dropped after 3 hours even if stop is never called. */
    private const val MAX_HOLD_MS = 3 * 60 * 60 * 1000L

    @Volatile private var instance: ListenService? = null
    @Volatile private var notice = Notice("Voxa is listening")
    /** Set by VoxaEngineModule: receives "pause", "resume", "mark" or "stop". */
    @Volatile var onAction: ((String) -> Unit)? = null

    val running: Boolean get() = instance != null

    fun clock(ms: Long): String {
      val s = ms / 1000
      return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, (s / 60) % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }

    /** Starts the service (or keeps it) with a plain notice. */
    fun start(context: Context, title: String) {
      if (instance != null) return
      notice = Notice(title)
      context.startForegroundService(Intent(context, ListenService::class.java))
    }

    /** Shows a new state: updates the notification in place, or starts the service if it is not running. */
    fun update(context: Context, n: Notice) {
      notice = n
      val s = instance
      if (s != null) s.show(n) else context.startForegroundService(Intent(context, ListenService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ListenService::class.java))
    }
  }
}
