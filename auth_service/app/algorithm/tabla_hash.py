import time


# Tabla Hash con encadenamiento separado. Funcion hash DJB2.
# Insertar, buscar, eliminar O(1) promedio. Redimensiona al superar carga 0.75.
class TablaHash:

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

    # DJB2: h = h * 33 + ord(c). Semilla 5381.
    def _hash(self, clave: str) -> int:
        h = 5381
        for c in clave:
            h = ((h << 5) + h) + ord(c)  # h * 33 + ord(c)
        return h % self.capacidad

    # --- Operaciones publicas ---

    # O(1) promedio. Si la clave existe, actualiza valor y timestamp.
    def insertar(self, clave: str, valor) -> None:
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

    # O(1) promedio. Retorna None si no existe o TTL expirado.
    def buscar(self, clave: str):
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

    # O(n) - duplica capacidad y rehashea. Amortizado O(1) por insert.
    def _redimensionar(self) -> None:
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

    # Metricas: capacidad, elementos, factor de carga, colisiones, distribucion.
    def estadisticas(self) -> dict:
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
