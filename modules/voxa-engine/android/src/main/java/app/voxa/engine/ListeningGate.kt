package app.voxa.engine

/** Common interface for live streaming ([GatedRecognizer]) and whole-sentence offline ([OfflineGatedRecognizer]). */
interface ListeningGate {
  val heardSamples: Long
  val decodedSamples: Long
  fun feed(samples: FloatArray, out: (GatedRecognizer.Result) -> Unit)
  fun finish(out: (GatedRecognizer.Result) -> Unit)
  fun release()
}
