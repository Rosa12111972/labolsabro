# Gestión de negocio (eventos)

Panel interno organizado en apartados independientes, navegables desde
el menú superior. Cada apartado vive en su propio módulo (`sections/`)
y funciona sin depender de que los demás estén construidos.

- **Personal** — construido. Personas (conductores, camareros, azafatas,
  técnicos) y su disponibilidad por día y franja horaria.
- **Eventos** — construido. Ficha de evento, estado, checklist de
  recursos y timeline (ver detalle más abajo).
- **Flota** — próximamente.
- **Lugares / Venues** — próximamente.

Los apartados se conectarán entre sí (un evento podrá tirar de personal
disponible o de un venue guardado) en una fase posterior explícita —
por ahora cada uno es independiente.

## Puesta en marcha

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

La primera vez que arranca crea la base de datos (`instance/personal.db`,
un fichero SQLite) y un usuario `admin` con una contraseña aleatoria que
se imprime **una sola vez** en la terminal. Guárdala.

Abre http://localhost:5000 e inicia sesión.

## Crear más usuarios

Varias personas pueden usar la herramienta a la vez, cada una con su
propio usuario:

```bash
export FLASK_APP=app.py
flask add-user maria "contraseña-de-maria"
```

## Reiniciar la base de datos desde cero

Esto borra todos los datos:

```bash
export FLASK_APP=app.py
flask init-db
```

## Estructura del proyecto

```
app.py                  # crea la app y registra cada apartado (blueprint)
auth.py                 # login / logout, decorador login_required
extensions.py           # conexión a la base de datos, comandos flask
sections/
  personal/routes.py    # apartado Personal (construido)
  eventos/routes.py     # apartado Eventos (construido)
  flota/routes.py       # placeholder "próximamente"
  lugares/routes.py     # placeholder "próximamente"
templates/
  base.html             # menú superior de apartados + sub-menú por apartado
  personal/*.html
  eventos/*.html
  proximamente.html     # plantilla compartida de los apartados vacíos
schema.sql               # tablas (compartidas por ahora; cada apartado
                          # podrá añadir las suyas cuando se construya)
```

Para construir un apartado nuevo: edita su `sections/<apartado>/routes.py`
y añade sus plantillas en `templates/<apartado>/` — no hace falta tocar
los demás apartados.

## Qué hace "Personal"

- **Personas**: alta, edición y baja de personas con nombre, rol
  (conductor/camarero/azafata/técnico), teléfono y zona donde pueden
  trabajar.
- **Disponibilidad**: por cada persona, marcar día + franja
  (mañana/tarde/noche) como Disponible, No disponible o Asignado.
- **Buscar disponibles**: filtrar por fecha, franja y rol para ver
  quién está disponible ese día.

## Qué hace "Eventos"

- **Ficha de evento**: nombre, cliente, tipo (boda/corporativo/feria/
  presentación de producto/privado/otro), fecha (o rango de fechas),
  ubicación (texto libre por ahora), invitados previstos, horario,
  presupuesto opcional y notas/requisitos especiales.
- **Estado**: en negociación / confirmado / en curso / finalizado /
  cancelado, cambiable a mano desde la ficha.
- **Recursos necesarios**: checklist manual de personal y vehículos
  (categoría + descripción libre + cantidad) con un marcador
  asignado/sin asignar. Todavía **no** se conecta con la disponibilidad
  real de Personal ni con Flota — eso es una fase posterior.
- **Línea de tiempo**: hitos con hora y descripción (agenda simple del
  propio evento). Todavía **no** calcula márgenes de traslado ni
  logística automática.
- **Listado**: filtrable por estado, tipo, cuándo (próximos/pasados) y
  cliente.
- **Calendario mensual**: los eventos en su día, con navegación entre
  meses.
- La ubicación es texto libre y no está conectada (todavía) con el
  apartado de Lugares/Venues.

## Notas

- Pensado para correr en local por ahora; no hay despliegue configurado.
- El login es básico (usuario/contraseña), sin roles ni permisos
  diferenciados — cualquier usuario puede ver y editar todo.
- Cambia `SECRET_KEY` (variable de entorno) antes de exponerlo fuera
  de tu máquina.
