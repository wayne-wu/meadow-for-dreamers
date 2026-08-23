import { mkdir, copyFile, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await mkdir('dist/src', { recursive: true });
await mkdir('dist/assets', { recursive: true });

await copyFile('index.html', 'dist/index.html');
await copyFile('src/main.js', 'dist/src/main.js');
await copyFile('src/styles.css', 'dist/src/styles.css');
await copyFile('assets/meadow_logo_dark.png', 'dist/assets/meadow_logo_dark.png');
await copyFile('assets/meadow_logo_light.png', 'dist/assets/meadow_logo_light.png');
await copyFile('assets/studio-meadow-logo-dark.png', 'dist/assets/studio-meadow-logo-dark.png');
await copyFile('assets/studio-meadow-logo-light.png', 'dist/assets/studio-meadow-logo-light.png');
