#!/usr/bin/env bash
# Builds the BoardFusion Android APK from scratch.
#   Needs: Node 20+, JDK 21, Android SDK (platform 36, build-tools 36.0.0) with ANDROID_HOME set.
#   Output: dist/BoardFusion-<version>-debug.apk and dist/BoardFusion-<version>-unsigned.apk
#   Signed release: set BF_KEYSTORE (path to the .p12), BF_KEYSTORE_PASSWORD and BF_KEY_ALIAS,
#   and it also writes dist/BoardFusion-<version>.apk. The keystore is never stored in this repo.
set -euo pipefail
cd "$(dirname "$0")"

VERSION_NAME="${VERSION_NAME:-$(node -p "require('./package.json').version")}"
VERSION_CODE="${VERSION_CODE:-1}"
BUILD_TOOLS="${BUILD_TOOLS:-36.0.0}"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK}"

npm ci --no-audit --no-fund
rm -rf android dist
npx cap add android

APP=android/app/src/main
cp native/java/MainActivity.java "$APP/java/com/boardfusion/app/MainActivity.java"
# Replace the template's placeholder icon and splash images with ours.
rm -f "$APP"/res/drawable*/splash.png "$APP"/res/mipmap-*dpi/ic_launcher*.png "$APP/res/drawable-v24/ic_launcher_foreground.xml"
cp -R native/res/. "$APP/res/"

sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" android/app/build.gradle
grep -q "versionCode ${VERSION_CODE}" android/app/build.gradle
echo "sdk.dir=${ANDROID_HOME}" > android/local.properties
# Keep Gradle inside small machines' memory.
sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx1100m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8/' android/gradle.properties

npx cap sync android
(cd android && ./gradlew --no-daemon assembleDebug assembleRelease)

mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk "dist/BoardFusion-${VERSION_NAME}-debug.apk"
UNSIGNED=android/app/build/outputs/apk/release/app-release-unsigned.apk
cp "$UNSIGNED" "dist/BoardFusion-${VERSION_NAME}-unsigned.apk"

if [ -n "${BF_KEYSTORE:-}" ]; then
  : "${BF_KEYSTORE_PASSWORD:?}" "${BF_KEY_ALIAS:?}"
  BT="$ANDROID_HOME/build-tools/$BUILD_TOOLS"
  "$BT/zipalign" -f -p 4 "$UNSIGNED" dist/aligned.apk
  "$BT/apksigner" sign --ks "$BF_KEYSTORE" --ks-type PKCS12 --ks-pass env:BF_KEYSTORE_PASSWORD \
    --ks-key-alias "$BF_KEY_ALIAS" --out "dist/BoardFusion-${VERSION_NAME}.apk" dist/aligned.apk
  rm -f dist/aligned.apk dist/*.idsig
  "$BT/apksigner" verify --verbose "dist/BoardFusion-${VERSION_NAME}.apk"
fi
ls -la dist
