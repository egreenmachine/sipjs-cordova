cordova.define('cordova/plugin_list', function(require, exports, module) {
module.exports = [
    {
        "file": "plugins/com.dooble.phonertc/www/phonertc.js",
        "id": "com.dooble.phonertc.PhoneRTC",
        "clobbers": [
            "cordova.plugins.phonertc"
        ]
    }
];
module.exports.metadata = 
// TOP OF METADATA
{
    "com.dooble.phonertc": "1.0.0"
}
// BOTTOM OF METADATA
});