test: build
	cordova run

build: clean
	mkdir -p platforms/android/assets/www/css
	cordova build

clean:
	find . | grep apk | xargs rm

sip:
	cd sip.js && npm install && grunt build && cp dist/sip.js ../www/js/sip.js

all: sip test

debug: all
	echo logcat | adb shell
