# Documentación — Endpoint `GET /api/hoy/`

## Descripción

Devuelve todas las subtareas **pendientes** del usuario autenticado, ya agrupadas y ordenadas según la regla de prioridad del planificador. La lógica de agrupamiento vive en el backend: el frontend solo renderiza lo que recibe.

---

## Request

| Campo        | Detalle                          |
|--------------|----------------------------------|
| Método       | `GET`                            |
| URL          | `/api/hoy/`                      |
| Auth         | Header `X-Usuario-Id: <user_id>` |
| Body         | Ninguno                          |

### Ejemplo de request

```http
GET /api/hoy/ HTTP/1.1
Host: backend-planificador-3sre.onrender.com
X-Usuario-Id: 6650a1f2e4b09d1a2c3f4e5d
```

---

## Response `200 OK`

```json
{
  "fecha": "2025-06-10",
  "regla": "Vencidas → Hoy → Próximas. Desempate: menor esfuerzo primero.",
  "carga_hoy_horas": 3.5,
  "vencidas": [
    {
      "id": "abc111",
      "nombre": "Parcial de Cálculo",
      "fecha": "2025-06-08",
      "horas": 2,
      "estado": "pendiente",
      "nota": "",
      "actividadId": "6650a1f2e4b09d1a2c3f4e5d",
      "actividadTitulo": "Preparación Parcial 1",
      "actividadCurso": "Cálculo Diferencial"
    }
  ],
  "hoy": [
    {
      "id": "abc222",
      "nombre": "Leer capítulo 3",
      "fecha": "2025-06-10",
      "horas": 1.5,
      "estado": "pendiente",
      "nota": "",
      "actividadId": "6650a1f2e4b09d1a2c3f4e5e",
      "actividadTitulo": "Taller de Lectura",
      "actividadCurso": "Literatura"
    }
  ],
  "proximas": [
    {
      "id": "abc333",
      "nombre": "Ejercicios integrales",
      "fecha": "2025-06-14",
      "horas": 2,
      "estado": "pendiente",
      "nota": "",
      "actividadId": "6650a1f2e4b09d1a2c3f4e5d",
      "actividadTitulo": "Preparación Parcial 1",
      "actividadCurso": "Cálculo Diferencial"
    }
  ]
}
```

---

## Campos del response

| Campo             | Tipo    | Descripción                                              |
|-------------------|---------|----------------------------------------------------------|
| `fecha`           | string  | Fecha actual del servidor (`YYYY-MM-DD`)                 |
| `regla`           | string  | Texto descriptivo de la regla de prioridad               |
| `carga_hoy_horas` | float   | Suma de horas de las subtareas del grupo `hoy`           |
| `vencidas`        | array   | Subtareas con fecha anterior a hoy, orden: fecha ASC     |
| `hoy`             | array   | Subtareas con fecha igual a hoy, orden: horas ASC        |
| `proximas`        | array   | Subtareas con fecha futura o sin fecha, orden: fecha ASC |

Cada subtarea incluye: `id`, `nombre`, `fecha`, `horas`, `estado`, `nota`, `actividadId`, `actividadTitulo`, `actividadCurso`.

---

## Regla de prioridad

```
1. Vencidas   → fecha < hoy       → orden: fecha ASC (la más antigua primero)
2. Hoy        → fecha == hoy      → orden: horas ASC (menor esfuerzo primero)
3. Próximas   → fecha > hoy       → orden: fecha ASC (la más próxima primero)
               sin fecha          → al final de próximas
```

---

## Errores

| Código | Motivo                            | Body                         |
|--------|-----------------------------------|------------------------------|
| `401`  | Header `X-Usuario-Id` ausente     | `{"error": "No autenticado"}`|

---

## Notas de implementación

- Las subtareas con `estado == "hecho"` se excluyen siempre.
- El campo `fecha` en cada subtarea es opcional; si está vacío, la subtarea cae en `proximas` al final.
- `carga_hoy_horas` refleja únicamente las horas del grupo `hoy`, no la suma total.
