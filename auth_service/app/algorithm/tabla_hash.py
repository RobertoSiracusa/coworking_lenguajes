import time


class TablaHash:
    """
    Tabla Hash implementada desde cero con encadenamiento separado (separate chaining).

    Cada bucket es una lista de tuplas (clave, valor, timestamp).
    Cuando dos claves colisionan (mismo indice), se agregan a la misma lista.

    Se usa como cache en memoria para tokens y usuarios recientes,
    evitando consultas repetidas a la base de datos.

    Funcion hash: variante DJB2 — simple y con buena distribucion.

    Complejidades:
        insertar:      O(1) promedio, O(n) peor caso (todas las claves colisionan)
        buscar:        O(1) promedio
        eliminar:      O(1) promedio
        redimensionar: O(n) — se ejecuta cuando el factor de carga supera 0.75
    """

    FACTOR_CARGA_MAX = 0.75
    CAPACIDAD_INICIAL = 16
    TTL_SEGUNDOS = 3600  # 1 hora

    def __init__(self, capacidad: int = CAPACIDAD_INICIAL, ttl: int = TTL_SEGUNDOS):
        self.capacidad = capacidad
        self.ttl = ttl
        self.buckets: list[list[tuple[str, any, float]]] = [[] for _ in range(capacidad)]
        self.total_elementos = 0
        self.total_colisiones = 0
        self.total_redimensiones = 0

    # --- Funcion hash ---

    def _hash(self, clave: str) -> int:
        """
        Funcion hash DJB2 de Daniel J. Bernstein.

        Proceso:
        1. Empezar con un valor inicial (5381)
        2. Para cada caracter: hash = hash * 33 + codigo ASCII del caracter
        3. Tomar modulo con la capacidad para obtener el indice del bucket

        El numero 33 produce buena distribucion estadistica.
        El valor 5381 es un primo que reduce colisiones.
        """
        h = 5381
        for c in clave:
            h = ((h << 5) + h) + ord(c)  # h * 33 + ord(c)
        return h % self.capacidad

    # --- Operaciones publicas ---

    def insertar(self, clave: str, valor) -> None:
        """
        Inserta o actualiza un par clave-valor.
        Si la clave ya existe, actualiza el valor y el timestamp.
        Complejidad: O(1) promedio.
        """
        indice = self._hash(clave)
        bucket = self.buckets[indice]

        # Buscar si la clave ya existe en el bucket
        for i, (k, v, ts) in enumerate(bucket):
            if k == clave:
                bucket[i] = (clave, valor, time.time())
                return

        # Clave nueva — verificar si hay colision
        if len(bucket) > 0:
            self.total_colisiones += 1

        bucket.append((clave, valor, time.time()))
        self.total_elementos += 1

        # Redimensionar si el factor de carga supera el umbral
        if self.factor_carga() > self.FACTOR_CARGA_MAX:
            self._redimensionar()

    def buscar(self, clave: str):
        """
        Busca un valor por clave.
        Retorna None si no existe o si el TTL expiro.
        Complejidad: O(1) promedio.
        """
        indice = self._hash(clave)
        bucket = self.buckets[indice]
        ahora = time.time()

        for i, (k, v, ts) in enumerate(bucket):
            if k == clave:
                if ahora - ts > self.ttl:
                    # Entrada expirada — eliminarla
                    bucket.pop(i)
                    self.total_elementos -= 1
                    return None
                return v
        return None

    def eliminar(self, clave: str) -> bool:
        """
        Elimina una entrada por clave.
        Retorna True si existia, False si no.
        Complejidad: O(1) promedio.
        """
        indice = self._hash(clave)
        bucket = self.buckets[indice]

        for i, (k, v, ts) in enumerate(bucket):
            if k == clave:
                bucket.pop(i)
                self.total_elementos -= 1
                return True
        return False

    def contiene(self, clave: str) -> bool:
        return self.buscar(clave) is not None

    def factor_carga(self) -> float:
        """Factor de carga = elementos / capacidad. Ideal: < 0.75."""
        return self.total_elementos / self.capacidad

    # --- Redimensionamiento ---

    def _redimensionar(self) -> None:
        """
        Duplica la capacidad y reubica todos los elementos.

        Proceso:
        1. Crear nuevo array de buckets con el doble de capacidad
        2. Recalcular el hash de cada elemento (porque cambio el modulo)
        3. Insertar cada elemento en su nueva posicion

        Complejidad: O(n) — se ejecuta rara vez gracias al factor de carga.
        El costo amortizado de insertar sigue siendo O(1).
        """
        self.total_redimensiones += 1
        vieja_capacidad = self.capacidad
        viejos_buckets = self.buckets

        self.capacidad = vieja_capacidad * 2
        self.buckets = [[] for _ in range(self.capacidad)]
        self.total_elementos = 0
        self.total_colisiones = 0

        for bucket in viejos_buckets:
            for clave, valor, ts in bucket:
                indice = self._hash(clave)
                if len(self.buckets[indice]) > 0:
                    self.total_colisiones += 1
                self.buckets[indice].append((clave, valor, ts))
                self.total_elementos += 1

    # --- Estadisticas ---

    def estadisticas(self) -> dict:
        """
        Retorna metricas de la tabla hash.
        Util para demostrar el comportamiento en clase.
        """
        buckets_vacios = sum(1 for b in self.buckets if len(b) == 0)
        cadena_mas_larga = max(len(b) for b in self.buckets) if self.buckets else 0

        return {
            "capacidad":            self.capacidad,
            "total_elementos":      self.total_elementos,
            "factor_carga":         round(self.factor_carga(), 4),
            "umbral_redimension":   self.FACTOR_CARGA_MAX,
            "total_colisiones":     self.total_colisiones,
            "total_redimensiones":  self.total_redimensiones,
            "buckets_vacios":       buckets_vacios,
            "buckets_ocupados":     self.capacidad - buckets_vacios,
            "cadena_mas_larga":     cadena_mas_larga,
            "ttl_segundos":         self.ttl,
        }

    def listar_claves(self) -> list[str]:
        """Retorna todas las claves no expiradas."""
        ahora = time.time()
        claves = []
        for bucket in self.buckets:
            for clave, valor, ts in bucket:
                if ahora - ts <= self.ttl:
                    claves.append(clave)
        return claves


# Instancia singleton — se comparte en toda la aplicacion
cache = TablaHash()
