const path = require('node:path');

/** @type {import('tailwindcss').Config} */
module.exports={content:[path.join(__dirname,'renderer/**/*.{html,ts,tsx}')],theme:{extend:{}},plugins:[]};
