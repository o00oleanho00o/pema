import {initializeApp} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {getMessaging,getToken,onMessage} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";

// Lấy thông tin cấu hình từ window
let tokenobj = author_get('fcm') != "" ? author_get('fcm') : "{}";
let firebaseOBJ=JSON.parse(tokenobj);

const firebaseConfig={
    apiKey: firebaseOBJ.apiKey,
    authDomain: firebaseOBJ.authDomain,
    projectId: firebaseOBJ.projectId,
    storageBucket: firebaseOBJ.storageBucket,
    messagingSenderId: firebaseOBJ.messagingSenderId,
    appId: firebaseOBJ.appId,
    measurementId: firebaseOBJ.measurementId,
    vapidKey: firebaseOBJ.vapidKey
    
}
let app, messaging;
function init(config) {
    if (!app) {
        let appconfig = config != undefined ? config : firebaseConfig;
        if (appconfig.apiKey == undefined || appconfig.apiKey == "") {
            return;
        }
        app = initializeApp(appconfig);
        messaging = getMessaging(app);
    }
}
init();
function requestNotificationPermission(config, grant, deni, fail) {
    init(config)
    // Initialize Firebase
    return Notification.requestPermission()
        .then((permission) => {
            if(permission==="granted") {
                grant();
                return getToken(messaging, { vapidKey: (config ? config.vapidKey : firebaseConfig.vapidKey) });
            }
            else if(permission==="denied") {
                deni();
            }
            else {
                fail();
            }
        })
        .then((token) => {
            if(token) {
                return token;
            } else {
                fail();
            }
        })
        .catch((err) => {
            fail();
        });
}
window.requestNotificationPermission=requestNotificationPermission;
 
window.onFirebaseMessageReceived = function (callback) {
    onMessage(messaging, (Received) => {
        let { notification, data, messageId } = Received;
        let dataReceived = data?.data ?? "{}";
        let icon = (data && data != "" && JSON.parse(dataReceived)?.icon != "") ? JSON.parse(dataReceived)?.icon : _SoftwareLogo;
        const payload = {
            data: {
                title: notification?.title ?? `${Outlang["Sys_thong_bao"]}`,
                icon: icon,
                body: notification?.body ?? "",
                messageId: messageId ?? "",
                data: data?.data ?? '{}'
            }
        };
        callback(payload);
    });
};

 