all: build
	cordova run

build: clean
	cordova build

clean:
	find . | grep apk | xargs rm

sip:
	cd sip.js && npm install && grunt && cp dist/sip.js ../www/js/sip.js
