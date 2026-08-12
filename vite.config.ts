import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  // Dev-only escape hatch for part 1 section 4a: a proxy that sends no CORS
  // headers is unreachable from the browser, and the failure it produces looks
  // nothing like "missing CORS headers". Routing through the dev server
  // sidesteps it while developing; a production build still calls the proxy
  // directly, which is why the settings panel exposes the toggle.
  const devProxyTarget = env['VITE_DEV_PROXY_TARGET'] ?? '';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
        '@data': path.resolve(root, './data'),
      },
    },
    optimizeDeps: {
      // Tầng B nạp `@sqlite.org/sqlite-wasm` bằng `import()` động và bó này tự
      // tìm file `.wasm` theo URL của chính module. Cho Vite gói lại trước thì
      // URL đó trỏ vào thư mục `.vite/deps` không có `.wasm` nào, và Tầng B
      // chết đúng lúc mở database.
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
    server: {
      // Cổng mặc định vẫn là 5173. Đọc `PORT` để hai phiên dev chạy song song
      // không giẫm lên nhau — một cái đang mở thì cái thứ hai không chết đứng.
      port: Number(env['PORT'] ?? '') || 5173,
      // Giữ lại từ Phần 0. Tầng B cuối cùng dùng VFS `opfs-sahpool`, chạy được ở
      // luồng chính và KHÔNG cần cross-origin isolation — đó chính là lý do
      // chọn nó, vì `dist/` mở bằng một file server bất kỳ thì không có hai
      // header này. Chúng vẫn ở đây cho VFS `opfs` bản Worker, nếu sau này một
      // phần nào đó cần tới.
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      ...(devProxyTarget === ''
        ? {}
        : {
            proxy: {
              '/llm-proxy': {
                target: devProxyTarget,
                changeOrigin: true,
                secure: true,
                rewrite: (requestPath: string) => requestPath.replace(/^\/llm-proxy/, ''),
              },
            },
          }),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
