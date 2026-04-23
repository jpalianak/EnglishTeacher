# English Voice Teacher

Profesor de inglés con voz, powered by Claude AI.

## Setup local

```bash
npm install
cp .env.example .env.local
# Editá .env.local y poné tu API key de Anthropic
npm run dev
# Abrí http://localhost:3000
```

## Deploy en Vercel (recomendado)

1. Subí este proyecto a un repositorio de GitHub
2. Entrá a https://vercel.com y conectá tu repo
3. En el paso de configuración, agregá la variable de entorno:
   - Name: `ANTHROPIC_API_KEY`
   - Value: tu key de https://console.anthropic.com
4. Hacé clic en Deploy

Listo. Vercel te da una URL pública que podés compartir con quien quieras.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | Tu API key de Anthropic (obligatoria) |

## Notas

- La voz usa la Web Speech API del navegador (funciona mejor en Chrome/Edge)
- El reconocimiento de voz requiere HTTPS en producción (Vercel lo provee automáticamente)
- Cada usuario que acceda a tu URL usa tu API key — monitoreá el uso en console.anthropic.com
