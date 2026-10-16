# Chronos — visión y fases de desarrollo

## Objetivo del producto

Desarrollar **Chronos**, un launcher de escritorio para Windows y Linux inspirado en la idea de una colección de cartuchos. La referencia de producto es [Carthage](https://github.com/lopiksaa/carthage), pero Chronos debe conservar nombre, identidad visual, código y recursos propios.

La aplicación debe reunir juegos de Steam, Heroic/Epic, Lutris, Flatpak, Battle.net y Riot, además de entradas manuales. La colección debe presentarse como una estantería de cartuchos con carátulas o etiquetas impresas de respaldo. Al iniciar un juego, el cartucho debe animarse hacia un dock. También debe ofrecer una forma cómoda de explorar las tiendas de Steam y Epic y comparar precios sin salir de Chronos.

El uso básico no debe requerir cuentas ni claves. Las claves opcionales de Steam Web API y SteamGridDB deben ampliar la biblioteca y mejorar las ilustraciones cuando el usuario decida añadirlas. El proyecto debe funcionar desde el código fuente y contar con instalación, empaquetado y actualización sencillos.

## Principios

- Priorizar datos y capacidades disponibles localmente; las funciones online son opcionales y deben explicar cuándo necesitan Internet.
- No pedir credenciales de las tiendas para descubrir instalaciones locales.
- Guardar las claves en el almacén seguro del sistema operativo, no en texto plano, archivos de configuración ni registros.
- Mantener la colección del usuario al actualizar, volver a escanear o quitar un launcher.
- Mostrar errores de lectura, red o lanzamiento de forma comprensible y permitir continuar usando el resto de la biblioteca.
- Separar la integración de cada tienda/launcher del modelo común de juegos para poder añadir proveedores sin rehacer la interfaz.
- Crear una identidad visual propia; no copiar código, logotipos, recursos ni nombre de Carthage.

## Estado de partida

La base está creada con Electron y una interfaz HTML/CSS/JavaScript. Incluye la estantería, alta manual, búsqueda, filtro por plataforma, orden alfabético, etiquetas de carátula, animación de lanzamiento, accesos a las tiendas y escaneo inicial de Steam, Heroic, Lutris y Flatpak. La biblioteca ahora se guarda en un archivo JSON versionado del usuario, migra la colección anterior de `localStorage`, conserva una copia de respaldo y usa módulos separados para almacenamiento y escaneo. El escaneo combina por título exacto entradas de distintos proveedores y conserva sus opciones de lanzamiento. Las claves pasan por `safeStorage` de Electron cuando hay un almacén seguro del sistema disponible. Lutris usa SQLite integrado en Node, con `sqlite3` y los archivos de configuración como alternativas.

Las Fases 1 a 4 y 6 a 7 están implementadas en el alcance indicado aquí. La fase 1 incluye almacenamiento versionado, migración, respaldo, deduplicación exacta por título y almacenamiento seguro opcional de claves. La fase 2 incluye Steam (manifiestos y bibliotecas adicionales), Heroic Epic/GOG/Amazon desde datos locales, Lutris y Flatpak en Linux, y detección de League of Legends/VALORANT/Runeterra y juegos de Battle.net en ubicaciones comunes de Windows. La fase 3 añade ficha editable, selección de destinos de lanzamiento, volver a localizar, quitar y estado de lanzamiento. La fase 4 añade favoritos, orden por actividad/plataforma, carga diferida de portadas y etiquetas locales de respaldo. La fase 5 busca precios regionales de Steam dentro de Chronos; Epic abre su búsqueda oficial como alternativa si GraphQL rechaza la consulta. La comparación de precios Epic queda pendiente porque su endpoint respondió HTTP 403. La fase 6 importa juegos de Steam por SteamID64 y permite buscar/guardar arte de SteamGridDB con claves protegidas por el almacén seguro del SO. La fase 7 incorpora bienvenida, región, builds configurados para Windows/Linux y búsqueda/descarga/aplicación de actualizaciones compatibles. El escaneo presenta recuentos por proveedor, errores aislados y permite ocultar juegos detectados. Dieciséis pruebas automatizadas pasan con `npm test`. Flatpak puede incluir apps que no sean juegos; Riot/Battle.net se detectan solo en Windows y ubicaciones comunes. La fase 8 se validó en Windows: NSIS y ejecutable portable compilan con Electron 44.8.0; el renderer usa sandbox, context isolation, preload restringido y CSP local. `npm audit --omit=dev` no informa vulnerabilidades; permanecen avisos moderados de una dependencia de desarrollo transitiva del empaquetador. Linux se aplaza hasta completar el trabajo en Windows, según la instrucción del usuario.

## Fases

### Fase 1 — Base del proyecto y persistencia fiable

- Establecer una estructura mantenible para la interfaz, el proceso principal, el acceso a datos y los adaptadores de proveedores.
- Sustituir `localStorage` como almacén principal por una base local versionada y migrable; conservar y migrar las bibliotecas creadas por la versión inicial.
- Definir un modelo común para juego, tienda de origen, identificador externo, estado de instalación, objetivo de lanzamiento, carátulas y metadatos.
- Añadir identificadores estables y reglas de deduplicación para que el mismo juego no aparezca repetido al combinar fuentes.
- Gestionar cambios de esquema, copias de seguridad y errores de almacenamiento sin perder la colección.

**Criterio de salida:** la colección y los ajustes sobreviven reinicios y actualizaciones, y las entradas importadas/manuales se mantienen separadas de los datos detectados automáticamente.

### Fase 2 — Conectores locales y escaneo multiplataforma

- Consolidar Steam en Windows y Linux: detectar instalaciones comunes, bibliotecas adicionales, manifiestos y metadatos disponibles sin clave.
- Completar Heroic en ambos sistemas para Epic, GOG y Amazon cuando sus datos locales permitan identificar la tienda y el juego.
- Completar Lutris en Linux con lectura robusta de su base local, incluida la instalación Flatpak, sin depender de que el ejecutable `sqlite3` esté instalado.
- Detectar aplicaciones Flatpak instaladas y distinguir las aplicaciones de juegos cuando sea posible.
- Añadir detección local de Battle.net y Riot en Windows donde existan metadatos/rutas conocidos; en Linux usar Lutris cuando esos juegos estén registrados allí.
- Añadir escaneo por proveedor, progreso, resumen de juegos encontrados y errores recuperables. No borrar juegos manuales o de otros proveedores al sincronizar.
- Incluir una acción para volver a escanear y una forma de revisar/ocultar juegos detectados que el usuario no quiera en la colección.

**Estado:** Steam, Heroic (Epic/GOG/Amazon vía Nile), Lutris, Flatpak y detección de Riot/Battle.net en Windows están conectados. Riot usa `RiotClientInstalls.json`; Battle.net revisa ubicaciones comunes y juegos conocidos. Hay escaneo separado por proveedor, resumen de recuentos/errores y ocultar entradas detectadas. Las ubicaciones de Battle.net no estándar no están cubiertas; Flatpak puede mostrar aplicaciones que no son juegos. La validación real de lanzamiento se hará en la Fase 8.

**Criterio de salida:** cada proveedor disponible se identifica por separado, el escaneo repetido no duplica juegos y un proveedor ausente o con datos dañados no impide cargar los demás.

### Fase 3 — Lanzamiento y gestión de la biblioteca

- Implementar objetivos de lanzamiento tipados por proveedor: URI de Steam/Heroic/Lutris, Flatpak, ejecutables y juegos añadidos manualmente.
- Resolver rutas con espacios y argumentos sin invocar una shell insegura; manejar asociaciones de protocolo ausentes y rutas desinstaladas.
- Proporcionar controles visibles para editar, quitar y volver a localizar juegos, además de añadirlos.
- Animar el cartucho seleccionado hacia el dock, mostrar el estado de lanzamiento y devolverlo a la estantería si falla.
- Añadir una ficha de juego con metadatos, tienda de origen, ruta/estado y acciones.

**Estado:** ficha de juego para ver metadatos y destino, editar campos, elegir entre varios lanzadores detectados, volver a localizar el archivo, quitar y lanzar con mensaje visible si falla. El lanzamiento usa protocolos registrados, ejecutables seleccionados y `execFile` en Linux para comandos como Flatpak. Las pruebas automatizadas cubren datos y sintaxis; el flujo real de lanzamiento aún necesita validar en Windows y Linux en la Fase 8.

**Criterio de salida:** las entradas se pueden iniciar por el mecanismo correcto en cada sistema y cualquier fallo ofrece un mensaje útil sin cerrar Chronos.

### Fase 4 — Estantería, arte y experiencia de uso

- Refinar la estantería para colecciones pequeñas y grandes, con tamaños adaptables, estados vacíos y carga progresiva.
- Añadir orden por nombre, plataforma, fecha de añadido y último uso; ampliar búsqueda y filtros.
- Mantener las etiquetas impresas generadas localmente como alternativa para toda carátula ausente o rota.
- Añadir selección de arte y caché local para evitar que la colección dependa de la disponibilidad de imágenes remotas.
- Añadir favoritos y una vista de actividad reciente sin sacrificar navegación con teclado, contraste o escalado de ventana.
- Revisar la identidad visual, iconos y recursos para asegurar que Chronos tiene una marca propia.

**Estado:** favoritos filtrables, vistas ordenables por nombre/plataforma/actividad, carga diferida de carátulas y arte tipográfico local de respaldo. La búsqueda/selección de arte de SteamGridDB y su descarga local están implementadas en la Fase 6. El paquete Windows incorpora un icono propio de Chronos.

**Criterio de salida:** una colección sin conexión o sin ilustraciones sigue siendo completa, legible y fácil de navegar.

### Fase 5 — Tiendas integradas y comparación de precios

- Crear una vista de tienda dentro de Chronos para buscar y explorar Steam y Epic; no limitarse a abrir sus sitios externos.
- Mostrar resultados con título, arte, precio actual, precio anterior/descuento cuando exista, moneda/región y enlace a la ficha oficial.
- Permitir comparar una búsqueda en Steam y Epic en una misma vista y ordenar por precio o descuento.
- Obtener datos de fuentes públicas u oficiales compatibles; no intentar simular inicio de sesión ni acceder a datos privados.
- Permitir región/moneda configurable, indicar el momento de consulta y tratar resultados ausentes o diferencias regionales con claridad.
- Respetar límites y condiciones de uso de los servicios; ofrecer abrir la ficha oficial cuando la tienda requiera acciones interactivas.

**Estado:** búsqueda regional de Steam con precio actual/anterior/descuento, arte y enlace oficial. Si Epic rechaza la consulta, Chronos ofrece la búsqueda web oficial. La comparación de precios Epic sigue pendiente; el endpoint devolvió HTTP 403 durante la verificación Windows.

**Criterio de salida:** se pueden buscar juegos y comparar precios de ambas tiendas desde la interfaz de Chronos, con región, moneda y hora de actualización visibles.

### Fase 6 — Claves, bibliotecas online y arte opcional

- Integrar Steam Web API de manera optativa para incorporar juegos de la cuenta que no estén instalados, cuando el perfil y la API permitan verlos.
- Integrar SteamGridDB de manera optativa para buscar, seleccionar y descargar arte.
- Añadir, validar, cambiar y borrar claves desde Ajustes; guardarlas en Credential Manager de Windows y Secret Service/KWallet equivalente en Linux.
- No exponer claves al renderer, a solicitudes de tiendas que no las necesitan, a registros ni al almacenamiento web local.
- Explicar con claridad qué datos añade cada clave y qué ocurre si está ausente, es inválida o el servicio no responde.
- Mantener el launcher utilizable sin configurar ninguna clave.

**Estado:** importar juegos visibles de Steam usando clave segura y SteamID64; buscar carátulas de SteamGridDB, elegir una y descargarla en datos locales. Las API se llaman desde el proceso principal; el renderer no recibe claves. La importación está limitada por la visibilidad del perfil de Steam.

**Criterio de salida:** claves opcionales guardadas de forma segura activan sus funciones y se pueden borrar; una instalación sin claves conserva todas las funciones locales.

### Fase 7 — Configuración inicial, ajustes y actualización

- Añadir una bienvenida breve para elegir idioma/región, detectar launchers y configurar claves opcionales sin bloquear el primer uso.
- Organizar ajustes de proveedores, privacidad, arte, precios, almacenamiento y actualizaciones.
- Proporcionar instaladores y builds para Windows y Linux (incluyendo un formato Linux portable cuando sea viable).
- Añadir comprobación de actualizaciones y, para builds compatibles, descarga/aplicación con confirmación y recuperación ante fallo.
- Para ejecución desde el código fuente, explicar requisitos y comandos; permitir comprobar si hay una versión nueva y abrir su página de publicación cuando no se pueda actualizar automáticamente.
- Publicar notas de versión y conservar los datos de usuario durante instalación, actualización y desinstalación.

**Estado:** diálogo de primer inicio con región y escaneo, ajustes para región/credenciales/proveedores/actualizaciones, NSIS/portable para Windows, AppImage/DEB configurados para Linux y actualización desde GitHub Releases en builds compatibles. Los instaladores Windows se generaron en Windows; AppImage/DEB y su actualización aún requieren validación en Linux.

**Criterio de salida:** un usuario nuevo puede instalar y abrir Chronos, y una versión instalada puede actualizarse sin borrar biblioteca ni ajustes.

### Fase 8 — Calidad, seguridad y publicación

- Verificar el flujo completo en Windows y al menos una distribución Linux, tanto con datos reales disponibles como sin ningún launcher instalado.
- Cubrir migraciones, deduplicación, rutas/argumentos, errores de proveedores, carátulas fallidas, precios regionales y ausencia de claves.
- Revisar la frontera de seguridad de Electron: aislamiento del contexto, IPC validado, navegación externa controlada, contenido remoto limitado y dependencias actualizadas.
- Medir tiempos de inicio/escaneo con bibliotecas grandes y mantener las lecturas de disco/red fuera del hilo de interfaz.
- Añadir documentación de instalación, privacidad, permisos, proveedores compatibles, limitaciones conocidas y solución de problemas.
- Automatizar builds y verificaciones de publicación para Windows y Linux, firmar artefactos cuando sea posible y mantener checksums/notas de versión.

**Estado:** 16 pruebas pasan; Electron 44.8.0 no tiene alertas de auditoría en runtime, aunque hay 8 alertas moderadas de una dependencia transitiva solo de desarrollo; el renderer está aislado, usa CSP y no carga fuentes remotas. NSIS y portable se generan como archivos separados e incluyen el icono propio de Chronos. GitHub Actions ejecuta pruebas, auditoría runtime, builds Windows y publica los artefactos de CI con checksums SHA-256. Aún falta validar la ejecución interactiva e instalación con datos reales en Windows. Linux se validará más adelante, según la instrucción del usuario.

**Criterio de salida:** la versión publicada instala y arranca en los dos sistemas objetivo, conserva los datos y documenta con precisión sus capacidades y limitaciones.

## Orden recomendado

Completar las fases 1 a 3 antes de ampliar proveedores. Después avanzar en paralelo de producto por las fases 4 a 6, y cerrar con configuración, empaquetado y publicación en las fases 7 y 8. Cada entrega debe actualizar este documento y el README con el alcance que realmente esté implementado.
