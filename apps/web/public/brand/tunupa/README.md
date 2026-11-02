# Identidad TUNUPA — Patch 01

Esta carpeta reúne los recursos gráficos de **TUNUPA — Gestor de Motores**.

## Fuente del símbolo

El símbolo oficial se vectorizó trazando el contorno del PNG elegido el 2 de noviembre de 2026.
La silueta respeta **tres terminales superiores, tres por costado, hueco central y base inferior**.
No se añadieron engranajes, montañas ni trazos nuevos. La forma es la misma en todos los archivos.
El símbolo conserva deliberadamente las proporciones de la imagen maestra; se normaliza el fondo como transparente.

## Archivos y usos

| Archivo | Uso previsto |
| --- | --- |
| `symbol.svg` | Silueta en azul original de referencia `#11243C` |
| `symbol-dark.svg` | Silueta marrón profundo `#2A1B12` para fondos claros |
| `symbol-light.svg` | Silueta blanca para fondos oscuros |
| `symbol-orange.svg` | Silueta naranja para detalles de identidad |
| `logo-horizontal.svg` | Logotipo oscuro horizontal para fondo claro |
| `logo-horizontal-light.svg` | Logotipo blanco horizontal para fondo oscuro |
| `logo-vertical.svg` | Logotipo oscuro vertical para fondo claro |
| `logo-vertical-light.svg` | Logotipo blanco vertical para fondo oscuro |
| `app-icon.svg` | Icono de aplicación con fondo marrón y microchip blanco |
| `app-icon-512.png` | Exportación de icono para aplicaciones 512 × 512 |
| `symbol-512.png` | Exportación PNG transparente del símbolo original |
| `logo-horizontal.png` | Exportación PNG horizontal con transparencia |

Los logotipos usan texto convertido a contornos vectoriales a partir de **Inter ExtraBold / SemiBold**;
no dependen de fuentes externas para renderizarse correctamente. El Patch 02 aplicará las fuentes
Montserrat/Inter a la interfaz. No se incluyen archivos de fuentes.

## Colores

- Marrón profundo: `#2A1B12`
- Cobre: `#4A2C1A`
- Naranja energético: `#F15A00`
- Naranja claro: `#FF8C42`
- Gris hielo: `#F3F4F6`
- Neutro dark de la interfaz: `#22242A`
- Azul original del símbolo (solo variante de referencia): `#11243C`

Variables para **uso futuro**: `apps/web/src/styles/tunupa-brand-tokens.css`.
El archivo no se importa en el CSS global en este patch: no modifica el layout ni el tema.

## Alcance y verificación

- Patch 01 **solo incorpora recursos**, no cambia el login ni el sidebar.
- Se preserva `public/brand/groundtek-logo.png`, necesario para el estado actual.
- `app-icon.svg` aún no se registra como favicon público. Su activación será Patch 03.
- Ejecutar `npm --prefix apps/web run test:brand` para validar consistencia de los archivos.
- La forma del símbolo proviene de un trazado de raster. Si se dispone del archivo vectorial original, puede sustituirse en una iteración futura bajo revisión visual.
