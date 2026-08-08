import { createApp } from "vue";
import App from "./App.vue";
import { initFirebase } from "./lib/firebase";
import "./style.css";

initFirebase();
createApp(App).mount("#app");
