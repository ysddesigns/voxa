# Keep rules applied to the app's release build (R8) by this module.

# sherpa-onnx's native code reads its Kotlin config classes by class and field
# name over JNI (GetFieldID / GetObjectField). R8 renaming or removing them makes
# those lookups return null and the app aborts when a model loads.
-keep class com.k2fsa.sherpa.onnx.** { *; }
-keepclassmembers class com.k2fsa.sherpa.onnx.** { *; }
