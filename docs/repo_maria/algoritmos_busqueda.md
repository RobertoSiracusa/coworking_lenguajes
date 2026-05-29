# Algoritmos de Busqueda — Documentacion Tecnica

Documento que describe cada algoritmo de busqueda implementado en los 4 microservicios del sistema de co-working: que hace, como funciona internamente, donde esta el codigo (archivo + lineas exactas) y donde se invoca.

---

## Tabla de contenido

1. [Space Service (Go)](#1-space-service-go)
   - 1.1 [Busqueda Lineal](#11-busqueda-lineal)
   - 1.2 [Busqueda Binaria](#12-busqueda-binaria)
   - 1.3 [Trie (autocompletado)](#13-trie-autocompletado)
   - 1.4 [Indice Invertido](#14-indice-invertido)
2. [Reservation Service (Java)](#2-reservation-service-java)
   - 2.1 [Busqueda Lineal por Fecha](#21-busqueda-lineal-por-fecha)
   - 2.2 [Busqueda Binaria por Fecha](#22-busqueda-binaria-por-fecha)
   - 2.3 [Interval Tree (AVL)](#23-interval-tree-avl)
   - 2.4 [Cola de Prioridad (Min-Heap)](#24-cola-de-prioridad-min-heap)
3. [Billing Service (Node.js)](#3-billing-service-nodejs)
   - 3.1 [Busqueda Lineal por Fecha](#31-busqueda-lineal-por-fecha)
   - 3.2 [Busqueda Binaria por Fecha](#32-busqueda-binaria-por-fecha)
   - 3.3 [Agrupamiento con Hash Map](#33-agrupamiento-con-hash-map)
   - 3.4 [Ventana Deslizante](#34-ventana-deslizante)
4. [Auth Service (Python)](#4-auth-service-python)
   - 4.1 [Tabla Hash con DJB2](#41-tabla-hash-con-djb2)
   - 4.2 [Busqueda Lineal de Usuarios](#42-busqueda-lineal-de-usuarios)

---

## 1. Space Service (Go)

### 1.1 Busqueda Lineal

**Que hace:** Recorre la lista completa de espacios comparando si el nombre contiene la query como substring. Sin pre-procesamiento.

**Complejidad:** O(n)

**Como funciona:**
1. Convierte query a minusculas
2. Itera todos los espacios
3. Para cada uno, comprueba `strings.Contains(nombre, query)`
4. Agrega coincidencias al resultado

**Codigo:**
- Archivo: `space_service/pkg/algorithm/busqueda.go`
- Funcion: `BusquedaLineal()` — lineas **10-21**

**Donde se invoca:**
- Archivo: `space_service/internal/handlers/espacio_handler.go`
- Linea **90**: `resultado = algorithm.BusquedaLineal(espacios, query)`
- Endpoint: `GET /espacios/buscar?algoritmo=lineal`

---

### 1.2 Busqueda Binaria

**Que hace:** Ordena la lista por nombre, encuentra el punto de insercion con busqueda binaria y luego expande en ambas direcciones para capturar matches parciales.

**Complejidad:** O(n log n) por el ordenamiento + O(log n) por la busqueda + O(k) por la expansion

**Como funciona:**
1. Convierte query a minusculas
2. Crea copia ordenada alfabeticamente (sin mutar original)
3. Usa `sort.Search` para encontrar primer indice cuyo nombre `>= query` — O(log n)
4. Expande hacia adelante y atras desde ese indice mientras haya substring match
5. Devuelve todos los matches encontrados

**Codigo:**
- Archivo: `space_service/pkg/algorithm/busqueda.go`
- Funcion: `BusquedaBinaria()` — lineas **22-51**

**Donde se invoca:**
- Archivo: `space_service/internal/handlers/espacio_handler.go`
- Linea **106**: `resultado = algorithm.BusquedaBinaria(espacios, query)`
- Endpoint: `GET /espacios/buscar?algoritmo=binaria` (default)

---

### 1.3 Trie (autocompletado)

**Que hace:** Arbol de prefijos. Cada nodo representa un caracter; ramas comparten prefijos comunes. Permite sugerir todas las palabras que empiezan con un prefijo dado.

**Complejidad:**
- Insertar palabra: O(L) donde L = longitud
- Sugerir por prefijo: O(L + k) donde k = sugerencias

**Como funciona:**
1. Estructura: cada `nodoTrie` tiene `map[rune]*nodoTrie hijos`, un flag `fin` y lista de palabras originales
2. Insertar: recorre el prefijo caracter por caracter, creando nodos donde falten
3. Sugerir: navega el prefijo dado y desde ahi hace DFS recolectando todas las palabras
4. Ordena resultados alfabeticamente

**Codigo:**
- Archivo: `space_service/pkg/estructuras/trie.go`
- Struct `nodoTrie` — linea **11**
- Struct `Trie` — linea **17**
- `Insertar(palabra)` — linea **29**
- `Sugerir(prefijo, max)` — linea **45**
- `recolectar()` DFS interno — linea **64**

**Donde se invoca:**
- Inicializacion: `cargarIndices()` en `espacio_handler.go` linea **44** llama `h.trie.Insertar(e.Nombre)` por cada espacio al arrancar
- Endpoint: `Sugerir()` en linea **119**, llama `h.trie.Sugerir(prefijo, max)` en linea **122**
- Endpoint: `GET /espacios/sugerir?q=sa`

---

### 1.4 Indice Invertido

**Que hace:** Estructura inversa que mapea `palabra → set de ids`. Tokeniza nombre + descripcion de cada espacio. Para buscar, intersecta los sets de cada palabra de la consulta (operador AND).

**Complejidad:**
- Indexar: O(palabras del texto)
- Buscar: O(palabras de la consulta × tamano del set mas pequeno)

**Como funciona:**
1. `Indexar(id, texto)`: tokeniza el texto (split por no-alfanumerico), para cada token agrega el id al set asociado
2. `Buscar(consulta)`: tokeniza la consulta, obtiene los sets de cada palabra, hace interseccion AND

Ejemplo:
```
indice = {
  "sala":    {1, 2, 7}
  "apolo":   {1}
  "podcast": {7}
}
buscar("sala apolo") → {1, 2, 7} ∩ {1} = {1}
```

**Codigo:**
- Archivo: `space_service/pkg/estructuras/indice_invertido.go`
- Struct `IndiceInvertido` — linea **11**
- `tokenizar()` — linea **23**
- `Indexar(id, texto)` — linea **32**
- `Buscar(consulta)` — linea **56**

**Donde se invoca:**
- Inicializacion: `cargarIndices()` en `espacio_handler.go` indexa todos los espacios al arrancar
- Endpoint: linea **94** del handler — `ids := h.indiceInvertido.Buscar(query)` cuando `algoritmo=indice`
- Endpoint: `GET /espacios/buscar?algoritmo=indice`

---

## 2. Reservation Service (Java)

### 2.1 Busqueda Lineal por Fecha

**Que hace:** Recorre la lista de reservas y compara la fecha de inicio (solo dia, sin hora) con la fecha buscada.

**Complejidad:** O(n)

**Como funciona:**
1. Itera todas las reservas
2. Para cada una, compara `r.getFechaInicio().toLocalDate().equals(fecha)`
3. Agrega coincidencias al resultado

**Codigo:**
- Archivo: `reservation-service/src/main/java/com/coworking/reservations/algorithm/BusquedaFechas.java`
- Metodo `busquedaLineal()` — linea **13**

**Donde se invoca:**
- Archivo: `service/ReservaService.java`
- Linea **427**: `resultados = BusquedaFechas.busquedaLineal(todas, fecha)`
- Endpoint: `GET /reservas/buscar-fecha?algoritmo=lineal`

---

### 2.2 Busqueda Binaria por Fecha

**Que hace:** Ordena las reservas por fecha de inicio, usa dos `lower_bound` para encontrar el rango de un dia completo (inicio del dia y inicio del siguiente).

**Complejidad:** O(n log n) por el ordenamiento + O(log n) por las dos busquedas binarias

**Como funciona:**
1. Copia y ordena por `fechaInicio` usando `Comparator.comparing()`
2. Calcula `inicio = fecha.atStartOfDay()` y `fin = fecha.plusDays(1).atStartOfDay()`
3. `lowerBound(inicio)` → indice del primer elemento `>= inicio`
4. `lowerBound(fin)` → indice del primer elemento `>= fin`
5. Retorna `subList(lo, hi)` — todas las reservas del dia

**Codigo:**
- Archivo: `reservation-service/src/main/java/com/coworking/reservations/algorithm/BusquedaFechas.java`
- Metodo `busquedaBinaria()` — linea **22**
- Helper `lowerBound()` — linea **35**

**Donde se invoca:**
- Archivo: `service/ReservaService.java`
- Linea **430**: `resultados = BusquedaFechas.busquedaBinaria(todas, fecha)`
- Endpoint: `GET /reservas/buscar-fecha?algoritmo=binaria`

---

### 2.3 Interval Tree (AVL)

**Que hace:** Estructura central del sistema. Arbol binario auto-balanceado (AVL) donde cada nodo guarda un intervalo `(fechaInicio, fechaFin)` y el `maxFin` del subarbol. Permite detectar solapamientos de horarios en tiempo logaritmico.

**Complejidad:**
- `insertar`: O(log n) con rotaciones AVL
- `eliminar`: O(log n)
- `buscarSolapamientos`: O(log n + k) donde k = solapamientos encontrados

**Propiedad clave:** Durante la busqueda, si `nodo.maxFin <= inicio_buscado`, todo el subarbol se descarta. Esa es la poda que reduce O(n) a O(log n + k).

**Como funciona:**
1. **Insertar**: BST normal por `fechaInicio` + rebalanceo AVL (rotaciones)
2. **Buscar**: recorre el arbol, descarta subarboles cuyo `maxFin < inicio_buscado`, evalua solapamiento en cada nodo
3. **Eliminar**: BST delete + rebalanceo

Estructura del nodo:
- `reserva`, `inicio`, `fin`, `maxFin`, `izq`, `der`, `altura`

**Codigo:**
- Archivo: `reservation-service/src/main/java/com/coworking/reservations/algorithm/IntervalTree.java`
- Clase principal — linea **10**
- Struct `Nodo` interno — linea **12**
- `insertar()` publico — linea **34**
- `eliminar()` — linea **40**
- `buscarSolapamientos(espacioId, inicio, fin, ignorarId)` — linea **47**
- `haySolapamiento()` — linea **54**
- `insertarRec()` con rotaciones — linea **63**
- `buscarRec()` (la poda) — linea **96**

**Donde se invoca:**
- Archivo: `service/ReservaService.java`
- Linea **118**: en `crear()` → `intervalTree.haySolapamiento(...)` para validar antes de insertar
- Linea **169**: en `editar()` → mismo check ignorando la propia reserva
- Reconstruccion al arrancar (`@PostConstruct`) con todas las PENDIENTE + CONFIRMADA

---

### 2.4 Cola de Prioridad (Min-Heap)

**Que hace:** No es busqueda estricta sino seleccion: siempre devuelve la reserva de mayor prioridad (menor numero). Implementacion manual de min-heap con `ArrayList<Reserva>`.

**Complejidad:**
- `verSiguiente()`: O(1) — lee la raiz
- `insertar()`: O(log n) — heapify-up
- `extraerMax()`: O(log n) — heapify-down
- `eliminarPorId()`: O(n) — busqueda lineal por id

**Como funciona:**
- Niveles de prioridad: 1=URGENTE, 2=NORMAL, 3=FLEXIBLE
- Raiz siempre tiene el menor numero
- `insertar`: agrega al final, sube por el arbol mientras tenga menor prioridad que el padre
- `extraerMax`: saca la raiz, mueve el ultimo elemento a la raiz, baja hasta encontrar su lugar

Representacion en array:
- `parent(i) = (i-1)/2`
- `leftChild(i) = 2i+1`
- `rightChild(i) = 2i+2`

**Codigo:**
- Archivo: `reservation-service/src/main/java/com/coworking/reservations/algorithm/ColaPrioridad.java`
- Clase principal — linea **11**
- `insertar()` — linea **16**
- `extraerMax()` — linea **22**
- `verSiguiente()` (O(1)) — linea **33**
- `verCola()` — linea **37**
- `eliminarPorId()` — linea **52**
- `vaciar()` — linea **114**

**Donde se invoca:**
- Al crear reserva (`crear()` en service) — agrega al heap
- Endpoint `POST /cola/confirmar` — extrae el de mayor prioridad
- Endpoint `GET /cola` — muestra estado de la cola
- Tab Cola del panel admin

---

### 2.5 IndiceReservas (HashMap + TreeMap)

**Que hace:** Indice multi-campo en memoria que permite filtrar reservas por usuario, estado, estado de pago, sala, dia, duracion o rango de fechas en O(1) o O(log n) sin tocar la BD. Sirve al endpoint `GET /reservas/mis-reservas` que filtra server-side.

**Complejidad:**
- `insertar` / `eliminar` / `actualizar`: O(1) sobre cada HashMap, O(log n) sobre TreeMap
- `buscar` con N filtros: O(min_set + N × min_set) por la interseccion AND

**Como funciona:**

Estructura: 7 mapas paralelos sobre los mismos `reservaId`:

| Mapa | Tipo | Propose |
|------|------|---------|
| `porUsuario` | `HashMap<Long, Set<Long>>` | usuarioId -> ids |
| `porEstado` | `HashMap<EstadoReserva, Set<Long>>` | estado -> ids |
| `porEstadoPago` | `HashMap<EstadoPago, Set<Long>>` | estadoPago -> ids |
| `porSala` | `HashMap<String, Set<Long>>` | nombre espacio -> ids |
| `porDuracion` | `HashMap<Integer, Set<Long>>` | duracion en horas -> ids |
| `porFecha` | `TreeMap<LocalDate, Set<Long>>` | dia -> ids (soporta `subMap` para rangos) |
| `porId` | `HashMap<Long, Reserva>` | id -> entidad para hidratar |

**Busqueda con N filtros:**

1. Obtiene set de ids por cada filtro presente
2. Ordena sets por tamano ASC (optimizacion: empezar interseccion por el mas chico)
3. `Set.retainAll()` aplica AND sucesivo
4. Si el set queda vacio en algun paso, retorna inmediato
5. Hidrata ids → reservas + ordena por `creadoEn` DESC

Thread-safe con `synchronized` en todas las operaciones mutadoras.

**Codigo:**
- Archivo: `reservation-service/src/main/java/com/coworking/reservations/algorithm/IndiceReservas.java`
- Clase principal — linea 11
- `insertar(Reserva)` — linea ~50
- `eliminar(Long id)` — linea ~62
- `actualizar(Reserva)` — linea ~73
- `buscar(usuarioId, estado, estadoPago, sala, dia, duracion, desde, hasta)` — linea ~88
- `vaciar()`, `tamanio()`, `estadisticas()` — al final

**Donde se invoca:**
- `service/ReservaService.java`
  - `inicializar()` al arrancar: carga todas las reservas con `indice.insertar(r)`
  - `crear()`: `indice.insertar(guardada)` despues del save
  - `editar()`, `cancelar()`, `pagar()`: `indice.actualizar(reserva)` despues del save
  - `actualizarEstructuras()`: `indice.actualizar(reserva)` (sincronizacion automatica)
  - `misReservasConFiltros(...)`: `indice.buscar(...)` — el corazon del endpoint
  - `reset()`: `indice.vaciar()`
- Endpoint: `GET /reservas/mis-reservas?estado=&estado_pago=&sala=&dia=&duracion=&desde=&hasta=`

**Por que server-side aqui:** un admin podria tener decenas de miles de reservas en el sistema. Mandar todo al browser para filtrar en memoria seria insostenible. El indice da O(1) lookup por campo + interseccion AND sobre sets pequenos. Igual de rapido que el cache local que tenia el frontend pero centralizado y consistente.

---

## 3. Billing Service (Node.js)

### 3.1 Busqueda Lineal por Fecha

**Que hace:** Recorre todas las facturas comparando `fecha_inicio` con la fecha buscada (solo dia, ignora hora).

**Complejidad:** O(n)

**Como funciona:**
1. Itera todas las facturas
2. Para cada una, llama `_misma_fecha(f.fecha_inicio, fecha)` que compara `getUTCFullYear/Month/Date`
3. Agrega matches al resultado

**Codigo:**
- Archivo: `billing_service/src/algorithm/busqueda.js`
- Helper `_misma_fecha()` — linea **2**
- Funcion `busqueda_lineal()` — linea **11**
- Export — linea **57**

**Donde se invoca:**
- Archivo: `billing_service/src/routes/facturas.js`
- Linea **6** import del modulo
- Linea **148**: `resultados = busqueda_lineal(result.rows, fecha)` cuando `algoritmo=lineal`
- Endpoint: `GET /facturas/buscar-fecha?algoritmo=lineal`

---

### 3.2 Busqueda Binaria por Fecha

**Que hace:** Ordena facturas por fecha y usa `lower_bound` para encontrar el rango del dia completo.

**Complejidad:** O(n log n) por el ordenamiento + O(log n) por las busquedas

**Como funciona:**
1. Copia y ordena por `fecha_inicio` (no muta el array original)
2. Calcula `inicio_dia` (00:00:00 UTC) y `inicio_dia_siguiente`
3. Dos `_lower_bound` para encontrar `idx_lo` y `idx_hi`
4. Retorna `slice(idx_lo, idx_hi)` — rango exacto del dia

**Codigo:**
- Archivo: `billing_service/src/algorithm/busqueda.js`
- Helpers `_inicio_dia()` linea **20**, `_inicio_dia_siguiente()` linea **26**
- Funcion `_lower_bound()` — linea **33**
- Funcion `busqueda_binaria()` — linea **44**

**Donde se invoca:**
- Archivo: `billing_service/src/routes/facturas.js`
- Linea **151**: `resultados = busqueda_binaria(result.rows, fecha)`
- Endpoint: `GET /facturas/buscar-fecha?algoritmo=binaria` (default)

---

### 3.3 Agrupamiento con Hash Map

**Que hace:** Una sola pasada sobre las facturas, agrupandolas por `espacio_id` o `usuario_id`. Usa objeto JavaScript como tabla hash (acceso O(1) promedio por clave).

**Complejidad:** O(n)

**Como funciona:**
1. Crea objeto vacio `grupos = {}`
2. Para cada factura:
   - `key = f.espacio_id` (o `usuario_id`)
   - Si la clave no existe en el objeto, crea entrada inicial
   - Acumula `total_facturas++`, `total_ingresos += parseFloat(f.total)`
3. `Object.values(grupos)` devuelve array final, redondea decimales

**Codigo:**
- Archivo: `billing_service/src/algorithm/reportes.js`
- `agrupar_por_espacio()` — linea **13**
- `agrupar_por_usuario()` — linea **40**
- Export — linea **112**

**Donde se invoca:**
- Archivo: `billing_service/src/routes/reportes.js`
- Linea **6-8** imports
- Linea **52**: `agrupar_por_espacio(result.rows)` en `GET /reportes/por-espacio`
- Linea **71**: `agrupar_por_usuario(result.rows)` en `GET /reportes/por-usuario`
- Linea **107**: `agrupar_por_espacio(result.rows)` en `GET /reportes/top-espacios`

---

### 3.4 Ventana Deslizante

**Que hace:** Genera N "ventanas" mensuales vacias y hace una sola pasada sobre las facturas acumulando en la ventana correspondiente. Evita N queries SQL (una por mes).

**Complejidad:** O(n) + O(m) creacion de ventanas (donde m = numero de meses)

**Como funciona:**
1. Crea array de ventanas: `[{año, mes, label, total_facturas:0, total_ingresos:0}, ...]` para los ultimos M meses
2. Itera todas las facturas:
   - Extrae año y mes de `f.creado_en`
   - Busca la ventana correspondiente con `find()` (lineal pero solo M ventanas)
   - Si existe, acumula totales
   - Si no, ignora la factura (fuera del rango)
3. Redondea totales

**Codigo:**
- Archivo: `billing_service/src/algorithm/reportes.js`
- Funcion `ingresos_por_mes()` — linea **64**

**Donde se invoca:**
- Archivo: `billing_service/src/routes/reportes.js`
- Linea **87**: `const datos = ingresos_por_mes(result.rows, meses)`
- Endpoint: `GET /reportes/ingresos-mensuales?meses=6`

---

## 4. Auth Service (Python)

### 4.1 Tabla Hash con DJB2

**Que hace:** Tabla hash implementada desde cero con encadenamiento separado (separate chaining). Funcion hash DJB2 de Daniel J. Bernstein. Soporta TTL por entrada y redimensionamiento automatico.

**Complejidad:**
- `insertar`, `buscar`, `eliminar`: O(1) promedio
- `_redimensionar`: O(n) cuando factor de carga > 0.75

**Como funciona:**

Funcion hash:
```
h = 5381
para cada caracter c en clave:
    h = h * 33 + ord(c)
retornar h % capacidad
```

Operaciones:
1. **Insertar**: calcula hash, recorre el bucket (lista de tuplas `(clave, valor, timestamp)`); si la clave existe actualiza, sino agrega
2. **Buscar**: calcula hash, recorre el bucket; si encuentra y no expiro (TTL), retorna; si expiro, lo elimina y retorna null
3. **Redimensionar**: cuando elementos/capacidad > 0.75, duplica capacidad y rehashea todo

**Codigo:**
- Archivo: `auth_service/app/algorithm/tabla_hash.py`
- Clase `TablaHash` — linea **4**
- `__init__` — linea **27**
- `_hash` (DJB2) — linea **37**
- `insertar` — linea **56**
- `buscar` (con TTL check) — linea **82**
- `eliminar` — linea **102**
- `_redimensionar` — linea **127**
- `estadisticas` — linea **158**
- Singleton `cache` — linea final del archivo

**Donde se invoca:**
- Archivo: `auth_service/app/routes/usuarios_routes.py`
- Linea **57**: `cache.insertar(f"email:{usuario.email}", {...})` despues de crear usuario
- Linea **153**: `cache.buscar(f"email:{q}")` en busqueda por email
- Otros invocaciones en `routes/auth_routes.py` para tokens

---

### 4.2 Busqueda Lineal de Usuarios

**Que hace:** Si `algoritmo=lineal`, recorre todos los usuarios de la BD filtrando por substring en email o nombre.

**Complejidad:** O(n)

**Como funciona:**
1. Carga TODOS los usuarios desde BD
2. Convierte query a minusculas
3. Filtra con list comprehension: `q_lower in u.email.lower() or q_lower in u.nombre.lower()`

**Codigo:**
- Archivo: `auth_service/app/routes/usuarios_routes.py`
- Endpoint `buscar_usuarios()` — linea **140** (decorador `@router.get("/buscar")`)
- Logica lineal — lineas **170-180** aprox

**Donde se invoca:**
- Endpoint: `GET /usuarios/buscar?q=&algoritmo=lineal`

**Versus hash (O(1) promedio):**
- Linea **151**: si `algoritmo=hash`, consulta directamente `cache.buscar(f"email:{q}")` — retorno instantaneo si el usuario fue cacheado en login/registro previo
- Linea **149**: documenta complejidad en docstring

---

## Resumen Comparativo

| Servicio | Algoritmo | Archivo | Linea | Endpoint |
|----------|-----------|---------|-------|----------|
| Space | Busqueda Lineal | `pkg/algorithm/busqueda.go` | 11 | `/espacios/buscar?algoritmo=lineal` |
| Space | Busqueda Binaria | `pkg/algorithm/busqueda.go` | 23 | `/espacios/buscar?algoritmo=binaria` |
| Space | Trie | `pkg/estructuras/trie.go` | 17 | `/espacios/sugerir?q=` |
| Space | Indice Invertido | `pkg/estructuras/indice_invertido.go` | 11 | `/espacios/buscar?algoritmo=indice` |
| Reservation | Lineal por fecha | `algorithm/BusquedaFechas.java` | 13 | `/reservas/buscar-fecha?algoritmo=lineal` |
| Reservation | Binaria por fecha | `algorithm/BusquedaFechas.java` | 22 | `/reservas/buscar-fecha?algoritmo=binaria` |
| Reservation | Interval Tree AVL | `algorithm/IntervalTree.java` | 10 | Interno: deteccion conflictos |
| Reservation | Min-Heap | `algorithm/ColaPrioridad.java` | 11 | `/cola`, `/cola/confirmar` |
| Reservation | IndiceReservas (HashMap+TreeMap) | `algorithm/IndiceReservas.java` | 11 | `/reservas/mis-reservas?...` |
| Billing | Lineal por fecha | `src/algorithm/busqueda.js` | 11 | `/facturas/buscar-fecha?algoritmo=lineal` |
| Billing | Binaria por fecha | `src/algorithm/busqueda.js` | 44 | `/facturas/buscar-fecha?algoritmo=binaria` |
| Billing | Hash map agrupar | `src/algorithm/reportes.js` | 13, 40 | `/reportes/por-espacio`, `/reportes/por-usuario` |
| Billing | Ventana deslizante | `src/algorithm/reportes.js` | 64 | `/reportes/ingresos-mensuales` |
| Auth | Tabla Hash DJB2 | `app/algorithm/tabla_hash.py` | 4 | `/usuarios/buscar?algoritmo=hash` |
| Auth | Lineal usuarios | `app/routes/usuarios_routes.py` | 140 | `/usuarios/buscar?algoritmo=lineal` |

## Patron didactico

3 de los 4 servicios exponen el mismo patron `?algoritmo=X` para comparar lineal vs algoritmo optimizado en la misma data:

- **Space**: lineal vs binaria vs indice invertido
- **Reservation**: lineal vs binaria por fecha
- **Billing**: lineal vs binaria por fecha
- **Auth**: lineal vs hash

Mismo dataset, mismo resultado, distinta complejidad. Util para demos academicos.
