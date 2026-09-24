#!/usr/bin/env bash
# Runs inside the Android emulator job. Installs the debug APK and tests it end to end.
set -uo pipefail
cd "$(dirname "$0")"
export OUT="$PWD/shots"; mkdir -p "$OUT"
PKG=com.boardfusion.app
APK=$(ls ../dist/BoardFusion-*-debug.apk | head -1)
rc=0
adb wait-for-device
adb shell settings put global window_animation_scale 0
adb install -r "$APK" || exit 1
netoff(){ adb shell svc wifi disable; adb shell svc data disable; }
neton(){ adb shell svc wifi enable; adb shell svc data enable; }

echo "== offline launch"; netoff; sleep 3
adb shell am start -W -n $PKG/.MainActivity
node webview-test.js offline 2>&1 | tee -a "$OUT/test-log.txt"; [ ${PIPESTATUS[0]} -eq 0 ] || rc=1
echo "== network back"; neton
node webview-test.js online-recover 2>&1 | tee -a "$OUT/test-log.txt"; [ ${PIPESTATUS[0]} -eq 0 ] || rc=1

echo "== fresh launch + game"; adb shell am force-stop $PKG; sleep 1
adb shell am start -W -n $PKG/.MainActivity
node webview-test.js game 2>&1 | tee -a "$OUT/test-log.txt"; [ ${PIPESTATUS[0]} -eq 0 ] || rc=1

echo "== back button on home page minimizes instead of closing"
adb shell input keyevent KEYCODE_BACK; sleep 2
adb exec-out screencap -p > "$OUT/09-after-back.png"
pid_before=$(adb shell pidof $PKG)
adb shell am start -n $PKG/.MainActivity; sleep 3
pid_after=$(adb shell pidof $PKG)
adb exec-out screencap -p > "$OUT/10-reopened.png"
if [ -n "$pid_before" ] && [ "$pid_before" = "$pid_after" ]; then echo "PASS app kept running after back ($pid_before)" | tee -a "$OUT/test-log.txt"; else echo "FAIL app process changed ($pid_before -> $pid_after)" | tee -a "$OUT/test-log.txt"; rc=1; fi

adb logcat -d -s Capacitor chromium AndroidRuntime:E > "$OUT/logcat.txt" 2>&1 || true
exit $rc
