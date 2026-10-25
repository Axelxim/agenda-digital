# Todo en Orden

Agenda multiplataforma para Android, web y Windows.

## Estructura

- `frontend/`: aplicación Angular/Ionic y proyecto Android de Capacitor.
- `frontend/src/`: código compartido de la aplicación.
- `frontend/android/`: proyecto nativo que se abre en Android Studio.
- `backend/`: API REST de CodeIgniter 4 para sincronización y MySQL.

## Comandos principales

Frontend:

```powershell
cd frontend
npm install
npm run build
npx cap sync android
```

Backend:

```powershell
cd backend
composer install
php spark serve
```

La documentación de la API está en `backend/README.md`.
