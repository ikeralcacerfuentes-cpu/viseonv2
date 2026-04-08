# VISEON — Surveillance Intelligence PWA

Sistema de vigilancia inteligente con detección de movimientos agresivos en tiempo real, ejecutado íntegramente en el navegador.

---

## Stack técnico

- HTML + CSS + JavaScript puro (sin frameworks, sin build steps)
- TensorFlow.js + MoveNet SinglePose Lightning para detección de pose
- PWA instalable (manifest + service worker)
- Sin servidor, sin Python, sin terminales

---

## Uso local

```bash
# Opción A: Python (cualquier versión)
python3 -m http.server 8080
# Abre http://localhost:8080

# Opción B: Node.js
npx serve .
```

> **Importante:** La API `getUserMedia` requiere HTTPS o localhost. No funciona abriendo el archivo HTML directamente con `file://`.

---

## Deploy en Vercel (recomendado)

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "Viseon PWA v1"
git remote add origin https://github.com/TU_USUARIO/viseon.git
git push -u origin main
```

### 2. Conectar en Vercel

1. Ve a [vercel.com](https://vercel.com) → New Project
2. Importa el repositorio de GitHub
3. **Framework Preset**: Other (sin framework)
4. **Root Directory**: `.` (raíz del proyecto)
5. **Build Command**: *(dejar vacío)*
6. **Output Directory**: `.` (raíz)
7. Haz clic en **Deploy**

Vercel desplegará la app en HTTPS automáticamente, lo que permite el acceso a la cámara.

### 3. iPhone como cámara (Continuity Camera)

Para usar el iPhone como cámara:
1. Asegúrate de que el Mac y el iPhone estén en la misma red Wi-Fi y tengan Bluetooth activado
2. Abre Safari o Chrome en el Mac
3. La cámara del iPhone aparecerá como opción al conceder permisos de cámara

---

## Estructura de archivos

```
viseon/
├── index.html          # App principal
├── style.css           # Estilos
├── app.js              # Lógica de detección y UI
├── sw.js               # Service Worker (PWA)
├── manifest.json       # Manifest PWA
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

---

## Lógica de detección

Réplica exacta del script Python original con MediaPipe:

- **Keypoints**: muñeca derecha (R_WRIST, índice 10) y hombro derecho (R_SHOULDER, índice 6)
- **Puñetazo horizontal**: cambio en distancia euclidiana muñeca↔hombro + aceleración de ese cambio durante N frames consecutivos
- **Puñetazo vertical**: cambio en coordenada Y de la muñeca + aceleración durante N frames consecutivos
- Todos los umbrales son ajustables desde la vista Configuración

---

## Paleta de colores

| Variable | Valor | Uso |
|---|---|---|
| `--bg` | `#080808` | Fondo principal |
| `--white` | `#f0f0f0` | Texto principal |
| `--red` | `#c0392b` | Alertas, acento |

Tipografías: Bebas Neue / Tenor Sans / Share Tech Mono
