# Todo en Orden para Windows

Aplicación independiente de escritorio construida con Electron, Vite y TypeScript.
No reutiliza las pantallas de Ionic: consume la misma API que Android para mantener
la información sincronizada entre dispositivos.

## Desarrollo

Con el backend local ejecutándose en `http://127.0.0.1:8080`:

```powershell
cd desktop
npm start
```

La interfaz de Windows se sirve en `http://localhost:5173`. Durante el desarrollo,
el acceso con Google utiliza temporalmente la página autorizada en
`http://localhost:8100/login` para devolver la sesión a Electron.

Cerrar la ventana oculta la aplicación en la bandeja del sistema. Para terminarla,
usa **Salir** desde el icono de Todo en Orden junto al reloj.

## Empaquetado

`npm run dist` generará el instalador NSIS en `desktop/release`. Antes de distribuirlo
se configurará la URL HTTPS del backend, la firma de código y el flujo OAuth definitivo
para escritorio.

El widget real de Windows 11 se añadirá posteriormente en `desktop/windows-widget`
como proveedor MSIX.
