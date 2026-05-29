#!/bin/bash
# Seed de datos ficticios para el sistema de co-working

set -e

AUTH=http://localhost:8001
SPACE=http://localhost:8002
RES=http://localhost:8003
BILL=http://localhost:8004

ADMIN_EMAIL="admin@test.com"
ADMIN_PASS="admin123"

login() {
  curl -s -X POST "$1/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$2\",\"password\":\"$3\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))"
}

echo "==> Login admin"
TOKEN=$(login "$AUTH" "$ADMIN_EMAIL" "$ADMIN_PASS")
if [ -z "$TOKEN" ]; then
  echo "Login fallo. Crea admin@test.com / admin123 primero."
  exit 1
fi
H="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"

echo "==> Reset previo (preserva tu admin)"
curl -s -X DELETE "$BILL/facturas/reset" -H "$H" > /dev/null
curl -s -X DELETE "$RES/reservas/reset"  -H "$H" > /dev/null
curl -s -X DELETE "$SPACE/espacios/reset" -H "$H" > /dev/null
curl -s -X DELETE "$AUTH/usuarios/reset" -H "$H" > /dev/null
echo "  ok"

# ============================================================
# ESPACIOS
# ============================================================
echo ""
echo "==> Creando 8 espacios"

# Devuelve id por stdout, log por stderr
crear_espacio() {
  local nombre="$1" desc="$2" cap="$3" precio="$4"
  local resp=$(curl -s -X POST "$SPACE/espacios" -H "$H" -H "$JSON" \
    -d "{\"nombre\":\"$nombre\",\"descripcion\":\"$desc\",\"capacidad\":$cap,\"precio_por_hora\":$precio}")
  local id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  echo "  + id=$id $nombre" >&2
  echo "$id"
}

E1=$(crear_espacio "Sala Apolo"      "Sala de juntas con proyector"   8  25.00)
E2=$(crear_espacio "Sala Hermes"     "Sala chica para entrevistas"    4  15.00)
E3=$(crear_espacio "Salon Olimpo"    "Salon grande para eventos"     30  80.00)
E4=$(crear_espacio "Oficina Atenea"  "Oficina privada con escritorio" 2  18.00)
E5=$(crear_espacio "Sala Zeus"       "Sala ejecutiva con TV 4K"      12  40.00)
E6=$(crear_espacio "Open Space Iris" "Coworking abierto"             20  10.00)
E7=$(crear_espacio "Sala Hades"      "Sala oscura para podcast"       6  35.00)
E8=$(crear_espacio "Cabina Eco"      "Cabina insonorizada"            1   8.00)

# ============================================================
# USUARIOS
# ============================================================
echo ""
echo "==> Creando 5 usuarios"

crear_usuario() {
  local nombre="$1" email="$2" pass="$3" rol="$4"
  local resp=$(curl -s -X POST "$AUTH/usuarios" -H "$H" -H "$JSON" \
    -d "{\"nombre\":\"$nombre\",\"email\":\"$email\",\"password\":\"$pass\",\"rol\":\"$rol\"}")
  local id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  echo "  + id=$id $nombre ($rol)" >&2
  echo "$id"
}

U_MARIA=$(crear_usuario  "Maria Lopez"  "maria@test.com"  "maria123"  "usuario")
U_JUAN=$(crear_usuario   "Juan Perez"   "juan@test.com"   "juan123"   "usuario")
U_ANA=$(crear_usuario    "Ana Garcia"   "ana@test.com"    "ana123"    "usuario")
U_CARLOS=$(crear_usuario "Carlos Ruiz"  "carlos@test.com" "carlos123" "usuario")
U_SOFIA=$(crear_usuario  "Sofia Diaz"   "sofia@test.com"  "sofia123"  "admin")

# ============================================================
# RESERVAS
# ============================================================
echo ""
echo "==> Creando reservas variadas"

iso_fecha() {
  local dias="$1" hora="$2" minutos="$3"
  date -d "+$dias day" +%Y-%m-%dT$(printf "%02d:%02d" "$hora" "$minutos"):00
}

crear_reserva() {
  local user_token="$1" espacio_id="$2" inicio="$3" fin="$4" prioridad="$5" notas="$6"
  local resp=$(curl -s -X POST "$RES/reservas" \
    -H "Authorization: Bearer $user_token" -H "$JSON" \
    -d "{\"espacioId\":$espacio_id,\"fechaInicio\":\"$inicio\",\"fechaFin\":\"$fin\",\"prioridad\":$prioridad,\"notas\":\"$notas\"}")
  local id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  if [ -n "$id" ]; then
    echo "  + reserva id=$id esp=$espacio_id prio=$prioridad" >&2
    echo "$id"
  else
    local err=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message','?'))" 2>/dev/null)
    echo "  ! fallo (esp=$espacio_id): $err" >&2
    echo ""
  fi
}

T_MARIA=$(login "$AUTH" maria@test.com maria123)
R1=$(crear_reserva  "$T_MARIA" "$E1" "$(iso_fecha 1 9 0)"   "$(iso_fecha 1 11 0)"  2 "Reunion equipo")
R2=$(crear_reserva  "$T_MARIA" "$E3" "$(iso_fecha 2 14 0)"  "$(iso_fecha 2 17 0)"  1 "Evento urgente")
R3=$(crear_reserva  "$T_MARIA" "$E5" "$(iso_fecha 5 10 30)" "$(iso_fecha 5 12 30)" 2 "Demo cliente")

T_JUAN=$(login "$AUTH" juan@test.com juan123)
R4=$(crear_reserva  "$T_JUAN" "$E2" "$(iso_fecha 1 15 0)"  "$(iso_fecha 1 16 0)"  2 "Entrevista")
R5=$(crear_reserva  "$T_JUAN" "$E4" "$(iso_fecha 3 9 0)"   "$(iso_fecha 3 13 0)"  3 "Trabajo focalizado")
R6=$(crear_reserva  "$T_JUAN" "$E6" "$(iso_fecha 4 10 0)"  "$(iso_fecha 4 18 0)"  2 "Dia de coworking")

T_ANA=$(login "$AUTH" ana@test.com ana123)
R7=$(crear_reserva  "$T_ANA" "$E7" "$(iso_fecha 2 16 0)"  "$(iso_fecha 2 19 0)"  1 "Grabacion podcast")
R8=$(crear_reserva  "$T_ANA" "$E8" "$(iso_fecha 6 11 0)"  "$(iso_fecha 6 12 0)"  3 "Llamada cliente")
R9=$(crear_reserva  "$T_ANA" "$E1" "$(iso_fecha 3 14 0)"  "$(iso_fecha 3 16 0)"  2 "Reunion clientes")

T_CARLOS=$(login "$AUTH" carlos@test.com carlos123)
R10=$(crear_reserva "$T_CARLOS" "$E1" "$(iso_fecha 7 9 0)"   "$(iso_fecha 7 11 0)"  2 "Planning sprint")
R11=$(crear_reserva "$T_CARLOS" "$E5" "$(iso_fecha 8 14 0)"  "$(iso_fecha 8 17 0)"  1 "Junta directiva")
R12=$(crear_reserva "$T_CARLOS" "$E3" "$(iso_fecha 10 10 0)" "$(iso_fecha 10 18 0)" 2 "Conferencia anual")
R13=$(crear_reserva "$T_CARLOS" "$E7" "$(iso_fecha 9 12 0)"  "$(iso_fecha 9 14 0)"  3 "Podcast solo")

# ============================================================
# CONFIRMAR
# ============================================================
echo ""
echo "==> Confirmando reservas (URGENTES primero - min-heap)"
for i in 1 2 3 4 5 6 7; do
  resp=$(curl -s -X POST "$RES/cola/confirmar" -H "$H")
  id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  prio=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('prioridadNombre',''))" 2>/dev/null)
  [ -n "$id" ] && echo "  + confirmada id=$id ($prio)"
done

# ============================================================
# PAGAR (genera factura via BillingClient)
# ============================================================
echo ""
echo "==> Pagando reservas confirmadas (genera facturas)"

pagar() {
  local id="$1" user_token="$2"
  [ -z "$id" ] && return
  local resp=$(curl -s -X PATCH "$RES/reservas/$id/pagar" \
    -H "Authorization: Bearer $user_token")
  local estPago=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('estadoPago','?'))" 2>/dev/null)
  echo "  + reserva $id -> estadoPago=$estPago"
}

pagar "$R1" "$T_MARIA"
pagar "$R2" "$T_MARIA"
pagar "$R7" "$T_ANA"
pagar "$R4" "$T_JUAN"

# ============================================================
# COMPLETAR (admin) - solo si CONFIRMADA + PAGADA
# ============================================================
echo ""
echo "==> Completando 2 reservas pagadas (admin)"

completar() {
  local id="$1"
  [ -z "$id" ] && return
  local resp=$(curl -s -X PATCH "$RES/reservas/$id/completar" -H "$H")
  local est=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('estado','?'))" 2>/dev/null)
  echo "  + reserva $id -> $est"
}

completar "$R1"
completar "$R2"

# ============================================================
# CANCELAR
# ============================================================
echo ""
echo "==> Cancelando 2 reservas"
[ -n "$R6" ]  && curl -s -X DELETE "$RES/reservas/$R6"  -H "$H" > /dev/null && echo "  + reserva $R6 cancelada"
[ -n "$R13" ] && curl -s -X DELETE "$RES/reservas/$R13" -H "$H" > /dev/null && echo "  + reserva $R13 cancelada"

# ============================================================
# RESUMEN
# ============================================================
echo ""
echo "================== RESUMEN =================="
TOTAL_ESP=$(curl -s -H "$H" "$SPACE/espacios?por_pagina=100" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
TOTAL_USR=$(curl -s -H "$H" "$AUTH/usuarios" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
TOTAL_RES=$(curl -s -H "$H" "$RES/reservas?por_pagina=100" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")
TOTAL_FAC=$(curl -s -H "$H" "$BILL/facturas" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))")

echo "Espacios:  $TOTAL_ESP"
echo "Usuarios:  $TOTAL_USR  (incluye admin original)"
echo "Reservas:  $TOTAL_RES"
echo "Facturas:  $TOTAL_FAC"
echo ""
echo "Credenciales:"
echo "  admin:    $ADMIN_EMAIL / $ADMIN_PASS"
echo "  usuarios: maria/juan/ana/carlos @test.com (password = nombre + '123')"
echo "  admin 2:  sofia@test.com / sofia123"
