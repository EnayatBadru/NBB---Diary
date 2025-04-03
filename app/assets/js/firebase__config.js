 // Import the functions you need from the SDKs you need
 import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
 import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";
 // TODO: Add SDKs for Firebase products that you want to use
 // https://firebase.google.com/docs/web/setup#available-libraries

 // Your web app's Firebase configuration
 // For Firebase JS SDK v7.20.0 and later, measurementId is optional
 const firebaseConfig = {
   apiKey: "AIzaSyAbKVhAbVOuzlPXpfYlCl8lRyXbxOeJqZE",
   authDomain: "ndd-diary-2f5d6.firebaseapp.com",
   projectId: "ndd-diary-2f5d6",
   storageBucket: "ndd-diary-2f5d6.firebasestorage.app",
   messagingSenderId: "582152839503",
   appId: "1:582152839503:web:67f06b4aaee3041cdd253a",
   measurementId: "G-H783JCC73Q"
 };

 // Initialize Firebase
 const app = initializeApp(firebaseConfig);
 const analytics = getAnalytics(app);