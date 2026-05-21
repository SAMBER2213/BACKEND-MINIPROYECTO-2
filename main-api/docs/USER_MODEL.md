# StudySync - Modelo de usuarios y autenticación

## Objetivo

Cumplir el flujo de autenticación manual y Google persistiendo el perfil en Firestore y bloqueando usernames duplicados.

## Colecciones Firestore

### `users/{uid}`

Documento principal del usuario autenticado por Firebase Authentication.

| Campo | Tipo | Requerido | Descripción |
| --- | --- | --- | --- |
| `uid` | string | Sí | UID de Firebase Auth. También es el ID del documento. |
| `email` | string | Sí | Email proveniente del token de Firebase. |
| `displayName` | string | Sí | Nombre visible usado en dashboard, salas y chat. |
| `username` | string | Sí | Username único, normalizado en minúsculas. |
| `photoURL` | string/null | No | Foto del usuario, si viene de Google o se actualiza después. |
| `createdAt` | string ISO | Sí | Fecha de creación del perfil. |
| `updatedAt` | string ISO | Sí | Última actualización del perfil. |

### `usernames/{username}`

Colección auxiliar para reservar usernames y evitar duplicados de forma transaccional.

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `uid` | string | Dueño del username. |
| `username` | string | Mismo valor que el ID del documento. |
| `createdAt` | string ISO | Fecha de reserva. |
| `updatedAt` | string ISO | Última actualización de la reserva. |

## Reglas de username

- Debe tener entre 3 y 20 caracteres.
- Solo permite letras minúsculas, números y guion bajo.
- Se normaliza con `trim().toLowerCase()` antes de guardar.
- Si otro UID ya reservó el username, la API responde `409`.

## Endpoints principales

- `GET /api/users/me`: obtiene el perfil del usuario autenticado desde Firestore.
- `POST /api/users/profile`: crea o actualiza el perfil y reserva el username en una transacción.
- `GET /api/users/username/{username}/available`: valida disponibilidad del username.
- `PUT /api/users/me`: actualiza nombre visible y foto.
- `DELETE /api/users/me`: elimina perfil, reserva de username y usuario en Firebase Auth.

## Evidencia para C4

1. Ejecutar `npm run dev` dentro de `main-api`.
2. Abrir `http://localhost:3001/api/docs`.
3. Capturar la sección `Users`, especialmente `POST /api/users/profile` y `GET /api/users/username/{username}/available`.
4. Capturar este documento como evidencia del modelo de usuarios y del índice de usernames.
