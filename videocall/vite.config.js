// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import tailwindcss from '@tailwindcss/vite'  // สำคัญ: import ชื่อนี้

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),  // เพิ่มตรงนี้ (ต้องมี import ข้างบน)
    mkcert({ trust: true })
  ],
  server: {
    https: true,
    host: '0.0.0.0',
    port: 3000
  }
})