# Evolution API para WhatsApp Business Assistant

Servidor que mantiene la sesión de WhatsApp (la que se enlaza escaneando el QR). La app en Vercel
habla con él por HTTPS. Necesitas un **servidor con Docker y un dominio**.

## Requisitos
- Un VPS Linux pequeño (1 vCPU / 2 GB RAM bastan para empezar) con **Docker + Docker Compose** y los puertos **80 y 443** abiertos.
- Un dominio o subdominio (ej. `evolution.tudominio.com`) con un registro **DNS A** apuntando a la IP del servidor.

## Despliegue
```bash
git clone https://github.com/Beeshech93/SAAS.git && cd SAAS/deploy/evolution
./setup.sh evolution.tudominio.com     # crea .env con secretos aleatorios y muestra la URL y la clave global
docker compose up -d
curl https://evolution.tudominio.com   # debe responder con un JSON de bienvenida (el HTTPS tarda ~1 min la primera vez)
```
Guarda la **clave global** que muestra `setup.sh` (también está en `.env`): puede crear y borrar todas las instancias del servidor.

## Conectar la app (lo haces tú, una vez)
1. En `https://saas-wishebee.vercel.app/dashboard/whatsapp` elige **Evolution API**.
2. URL del servidor: `https://evolution.tudominio.com` · Nombre de la instancia: el que quieras (ej. `mi-negocio`) · Clave: la **clave global**.
3. Marca **Créer l'instance sur le serveur** y guarda. La app crea la instancia, guarda solo la clave propia de esa instancia y registra el webhook.
4. Pulsa **Afficher le QR code** y escanéalo desde el teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo.

## Operación
- Actualizar: cambia la etiqueta de `evoapicloud/evolution-api` en `docker-compose.yml` y `docker compose pull && docker compose up -d`.
- Copias de seguridad: los volúmenes `postgres_data` y `evolution_instances` (si se pierden hay que volver a escanear el QR).
- Evolution usa WhatsApp Web de forma no oficial: **envía poco volumen y evita spam**, WhatsApp puede bloquear el número.
