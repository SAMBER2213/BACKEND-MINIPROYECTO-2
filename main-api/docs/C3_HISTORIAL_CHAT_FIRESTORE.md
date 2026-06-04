# C3 - Historial de Chat en Firestore

## Coleccion usada

Los mensajes se guardan en una subcoleccion por sala:

```txt
rooms/{roomId}/messages/{messageId}
```

## Forma del documento

```json
{
  "id": "uuid",
  "clientMessageId": "client-uid-timestamp",
  "roomId": "roomId",
  "senderUid": "uid",
  "senderName": "Nombre visible",
  "senderPhotoURL": null,
  "text": "Mensaje",
  "createdAt": "2026-06-03T20:11:00.000Z",
  "persistedAt": "2026-06-03T20:11:00.000Z",
  "storagePath": "rooms/{roomId}/messages/{messageId}"
}
```

## Flujo

1. El cliente emite `send_message` por Socket.io.
2. `realtime-server` valida usuario, sala y texto.
3. El servidor guarda el mensaje en Firestore.
4. Si el guardado fue exitoso, emite `new_message` a todos los sockets de la sala.
5. Al entrar o recargar la sala, `main-api` responde `GET /api/rooms/{roomId}/messages` con los ultimos mensajes persistidos.

## Endpoint documentado

```txt
GET /api/rooms/{roomId}/messages?limit=75&roomCode=ABCD1234
```

- `limit`: minimo 1, maximo 100.
- `roomCode`: requerido para invitados en salas privadas.

## Evidencia minima para rubrica

- Captura de Firestore con los documentos en `rooms/{roomId}/messages`.
- Captura de la UI despues de recargar la sala mostrando los mismos mensajes.
- Captura de Swagger con el endpoint de historial.
