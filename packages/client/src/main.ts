import { createApp } from 'vue';
import App from './App.vue';
import '@desirecore/super-doc/dist/super-doc.css';
import { createPinia } from 'pinia';

const pinia = createPinia();

const app = createApp(App);
app.use(pinia);
app.mount('#app');
