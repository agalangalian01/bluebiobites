# BlueBioBites

**El mar, explicado a bocados.**

Blog de divulgación científica sobre biología marina, ecología y conservación marina, microbiología marina, biotecnología marina, química y bioquímica marina, genética y genómica marina, oceanografía y geología marina, y acuicultura y ciencias pesqueras — escrito por Alejandro Galán. Incluye también una agenda de charlas, congresos y talleres sobre estas disciplinas en Alicante, Elche, Murcia y alrededores.

🔗 **Web en producción:** `https://agalangalian01.github.io/bluebiobites/` (GitHub Pages)

---

## Sobre el proyecto

BlueBioBites nace como ejercicio personal de lectura científica: convertir artículos y hallazgos de biología y biotecnología marina en piezas cortas, rigurosas y sin jerga innecesaria, con las mismas referencias que se citarían en un contexto académico (formato APA 7).

El nombre juega con el formato del contenido — piezas breves y "masticables" ("bites") sobre ciencia marina — y con la doble lectura en inglés de "bio" (biología / bocado).

**Referentes de estilo y formato** consultados durante el diseño del proyecto: *oceanbites*, *Ciencia Marina y otros asuntos*, *Educación Azul*, *Microbacterium*.

## Sobre el autor

Alejandro Galán — graduado en Ciencias del Mar y Máster en Biotecnología para la Salud y la Sostenibilidad (Universidad de Alicante). Su trabajo académico ha pasado por microplásticos en islas remotas (espectroscopía Raman), efecto del quitosano sobre hongos de control biológico, aislamiento de *Vibrio* en muestras costeras de Alicante, y microbiota de *Hediste diversicolor* mediante secuenciación 16S con PacBio. Buceador titulado (Advanced Open Water, Enriched Air Diver).

En la página "Sobre mí" del sitio hay además un botón para descargar el CV en PDF (`assets/CV_Alejandro_Galan_Galian.pdf`) y un enlace directo al perfil de LinkedIn.

## Categorías del blog

| Categoría | Descripción |
|---|---|
| Biología marina | `bio` |
| Ecología marina y conservación | `eco` |
| Microbiología marina | `micro` |
| Biotecnología marina | `biot` |
| Química y bioquímica marina | `quim` |
| Genética y genómica marina | `gen` |
| Oceanografía y geología marina | `ocea` |
| Acuicultura y ciencias pesqueras | `acui` |

Cada artículo se etiqueta además como **Noticia** o **Técnica**.

---

## Identidad visual

| Elemento | Valor |
|---|---|
| Azul marino (navy) | `#0B3D57` |
| Turquesa mediterráneo (teal) | `#17A398` |
| Coral | `#F2665E` |
| Tinta (texto) | `#12293A` |
| Arena / crema (fondos) | `#F7F1E3` |
| Tipografía | DM Sans (Google Fonts) |
| Logo | Placa de Petri vista desde arriba, con un mordisco en el borde, con una ola estilizada y puntos de colonia microbiana dentro |

---

## Arquitectura técnica

BlueBioBites es una **single-page application en JavaScript puro** (sin frameworks, sin build ni npm), pensada para vivir entera en GitHub Pages:

- `index.html` — único punto de entrada. Contiene solo el `<div id="app">` donde se monta todo, más los estilos base y las media queries de responsive.
- `app.js` — toda la lógica: enrutado por hash (`#/inicio`, `#/sobre`, `#/articulos`, `#/articulo/<slug>`, `#/agenda`), renderizado (funciones que devuelven cadenas HTML), estado de la app, filtros de artículos, buscador, formulario de newsletter y sistema de comentarios.
- `analytics.js` — carga Google Analytics (GA4) de forma diferida y solo tras el consentimiento de cookies del visitante.
- No hay paso de compilación: lo que se sube al repositorio es exactamente lo que se sirve (salvo las páginas pre-renderizadas de `articulo/`, ver más abajo).

Al cargar la página, `app.js` pide de forma asíncrona los tres archivos de contenido (ver más abajo) y con eso construye el sitio. El diseño, los estilos y el comportamiento no dependen de este contenido — solo los textos.

### Funcionalidades destacadas

- **Agenda con vista de mapa**: además del listado, la página Agenda ofrece una vista de mapa interactivo (Leaflet.js + teselas de OpenStreetMap) con los eventos presenciales geolocalizados, filtrable por tipo de evento.
- **Sección de Instagram en Inicio**: tarjeta destacada que enlaza al perfil de Instagram (@bluebiobites).
- **CV y LinkedIn en Sobre mí**: botones de descarga del CV en PDF y enlace al perfil de LinkedIn.
- **SEO**: cada artículo tiene además una página pre-renderizada individual e indexable en `articulo/<slug>/index.html` (generadas con `scripts/prerender.ps1`), más `sitemap.xml`, `robots.txt` y una página `404.html` personalizada.
- **Analítica y privacidad**: Google Analytics vía `analytics.js`, activado solo tras aceptar el aviso de cookies, con su correspondiente página `privacidad.html`.

### Estructura del repositorio

```
bluebiobites/
├── index.html # Punto de entrada de la SPA
├── app.js # Toda la lógica de la aplicación
├── analytics.js # Google Analytics gated tras consentimiento de cookies
├── 404.html # Página de error 404 personalizada
├── privacidad.html # Política de privacidad / cookies
├── robots.txt # Directivas para rastreadores
├── sitemap.xml # Mapa del sitio para buscadores
├── .pages.yml # Configuración de Pages CMS (edición sin código)
├── .nojekyll # Desactiva el procesado Jekyll de GitHub Pages
├── comentarios_supabase.sql # Script de creación de la tabla de comentarios
├── assets/ # Logo, foto de perfil y CV descargable
├── content/
│ ├── articulos.json # Artículos del blog
│ ├── sobre-mi.json # Párrafos de la página "Sobre mí"
│ └── agenda.json # Charlas, congresos, talleres, webinars y convocatorias
├── articulo/
│ └── <slug>/index.html # Página pre-renderizada por artículo (SEO)
├── scripts/
│ └── prerender.ps1 # Genera las páginas de articulo/<slug>/ a partir de articulos.json
├── .gitignore
└── README.md
```

---

## Gestión de contenido (sin escribir código)

El contenido vive en `content/*.json`, no en `app.js`. Esto permite editarlo con **[Pages CMS](https://app.pagescms.org)** (gratuito, inicio de sesión con GitHub) en vez de tocar código:

1. Entra en `app.pagescms.org`, inicia sesión con GitHub y abre este repositorio.
2. Verás tres secciones editables: **Artículos**, **Sobre mí** y **Agenda**, cada una con un formulario.
3. Guardar desde ahí hace un commit automático al repositorio; GitHub Pages reconstruye la web en 1-2 minutos.

La configuración de qué campos son editables y con qué tipo de control (texto, selector, fecha, etc.) está definida en `.pages.yml`, en la raíz del repositorio.

### Esquema de `content/articulos.json`

Cada artículo dentro de la lista `articulos` tiene estos campos:

| Campo | Tipo | Notas |
|---|---|---|
| `slug` | texto | Identificador único en la URL, sin espacios ni tildes |
| `cat` | texto | Una de las categorías de la tabla anterior |
| `type` | texto | `noticia` o `tecnica` |
| `date` | texto | Fecha en formato libre, ej. `"14 julio 2026"` |
| `read` | texto | Tiempo de lectura estimado, ej. `"7 min"` |
| `title` | texto | Título del artículo |
| `excerpt` | texto | Resumen corto (aparece en las tarjetas de listado) |
| `bites` | lista de texto | Frases clave / conclusiones rápidas |
| `body` | lista de texto | Un elemento por párrafo del cuerpo |
| `ref` | lista de texto | Referencias en formato APA 7 |

Tras editar `articulos.json` conviene regenerar las páginas de `articulo/<slug>/` con `scripts/prerender.ps1` para mantener el SEO al día.

### Esquema de `content/agenda.json`

Cada evento dentro de la lista `eventos`: `day`, `month`, `year`, `type` (`Congreso` / `Taller` / `Webinar` / `Convocatoria`), `title`, `place`, `org`, `time`, `url`, `upcoming` (booleano), y opcionalmente `lat` / `lng` (coordenadas decimales) para que el evento aparezca geolocalizado en la vista de mapa de la Agenda. Los eventos online (`place: "Online"`) no llevan `lat`/`lng`.

### Esquema de `content/sobre-mi.json`

Un único campo `parrafos`: lista de bloques de texto que forman la página "Sobre mí". Los botones de CV y LinkedIn no forman parte de este JSON: están definidos directamente en `app.js` (función `renderSobre`).

---

## Sistema de comentarios

Los comentarios **no viven en el propio repositorio** (no tendría sentido en un sitio estático): usan **[Supabase](https://supabase.com)** (PostgreSQL) como backend gratuito.

- La tabla `comments` y sus políticas de seguridad (Row Level Security) están definidas en `comentarios_supabase.sql`.
- Un visitante puede escribir un comentario dando su nombre, email y texto — el email nunca se muestra públicamente. El comentario queda con `approved = false` hasta que se revisa.
- La moderación (aprobar comentarios, responder públicamente como autor) se hace directamente desde el **Table Editor** de Supabase, no desde la web pública. Marcar `is_author = true` en una respuesta añade la insignia "Autor" en el sitio.
- No hay sistema de login de visitantes: la seguridad recae en las políticas RLS (un visitante nunca puede leer comentarios no aprobados, ni marcarse a sí mismo como autor, ni editar o borrar comentarios de nadie).

El proyecto ya tiene un backend de Supabase configurado (constantes `SUPABASE_URL` y `SUPABASE_ANON_KEY` al principio de `app.js`), por lo que los comentarios están activos en producción. Para apuntar el sitio a otro proyecto de Supabase:

1. Crear un proyecto gratuito en Supabase y ejecutar `comentarios_supabase.sql` en su editor SQL.
2. Copiar el *Project URL* y la clave *anon public* del proyecto (Project Settings → Data API).
3. Sustituir esos dos valores en las constantes `SUPABASE_URL` y `SUPABASE_ANON_KEY` al principio de `app.js`.

Si esas dos constantes no se configuran, el sitio funciona con normalidad y la sección de comentarios muestra simplemente "Los comentarios están desactivados de momento en esta web."

---

## Desarrollo local

Al no haber build ni dependencias, basta con servir la carpeta con un servidor estático simple (no abrir `index.html` haciendo doble clic, porque `fetch()` necesita `http://`, no `file://`):

```bash
# Desde la raíz del repositorio
python3 -m http.server 8000
# Abrir http://localhost:8000 en el navegador
```

## Despliegue

El sitio se sirve directamente desde **GitHub Pages**, rama `main`. Cualquier commit a `main` (ya sea manual, vía Pages CMS o vía Supabase para comentarios) provoca una reconstrucción automática en 1-2 minutos.

---

## Hoja de ruta

- [x] Sustituir los artículos y eventos de ejemplo por contenido real.
- [x] Activar el sistema de comentarios (Supabase configurado).
- [x] Añadir enlace al perfil de Instagram (@bluebiobites).
- [ ] Revisar y completar el resto de handles de redes sociales.

## Licencia

El código de este sitio puede reutilizarse libremente como referencia. El contenido de los artículos (texto, imágenes y su selección) es © Alejandro Galán.
