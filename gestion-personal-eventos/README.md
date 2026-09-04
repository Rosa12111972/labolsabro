# Gestión de personal para eventos

Herramienta interna sencilla para llevar el listado de personal
(conductores, camareros, azafatas, técnicos) y su disponibilidad
por día y franja horaria. Primera fase de un proyecto más grande:
todavía no incluye gestión de eventos, flota ni cálculo de tiempos.

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

Esto borra todos los datos (personas y disponibilidad):

```bash
export FLASK_APP=app.py
flask init-db
```

## Qué hace

- **Personas**: alta, edición y baja de personas con nombre, rol
  (conductor/camarero/azafata/técnico), teléfono y zona donde pueden
  trabajar.
- **Disponibilidad**: por cada persona, marcar día + franja
  (mañana/tarde/noche) como Disponible, No disponible o Asignado.
- **Buscar disponibles**: filtrar por fecha, franja y rol para ver
  quién está disponible ese día.

## Notas

- Pensado para correr en local por ahora; no hay despliegue configurado.
- El login es básico (usuario/contraseña), sin roles ni permisos
  diferenciados — cualquier usuario puede ver y editar todo.
- Cambia `SECRET_KEY` (variable de entorno) antes de exponerlo fuera
  de tu máquina.
