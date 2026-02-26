import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, onValue, onChildAdded, query, orderByChild, orderByKey, startAt, endAt, get, limitToFirst, limitToLast } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCwqmNjvPDYsh2XuncbXlFdwhpFH2HSVLE",
    authDomain: "energy-monitoring-f05ad.firebaseapp.com",
    databaseURL: "https://energy-monitoring-f05ad-default-rtdb.firebaseio.com",
    projectId: "energy-monitoring-f05ad",
    storageBucket: "energy-monitoring-f05ad.firebasestorage.app",
    messagingSenderId: "880674065081",
    appId: "1:880674065081:web:e7fc520f0bb87da4846968"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, ref, onValue, onChildAdded, query, orderByChild, orderByKey, startAt, endAt, get, limitToFirst, limitToLast };
