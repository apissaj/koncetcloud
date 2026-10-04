import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

const storedTheme = window.localStorage.getItem('omni-buddy-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
document.documentElement.classList.toggle('dark', initialTheme === 'dark');

createApp(App).mount('#app');