DROP TABLE IF EXISTS disponibilidad;
DROP TABLE IF EXISTS personas;
DROP TABLE IF EXISTS evento_hitos;
DROP TABLE IF EXISTS evento_recursos;
DROP TABLE IF EXISTS eventos;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    google_sub TEXT UNIQUE
);

CREATE TABLE personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('conductor', 'camarero', 'azafata', 'tecnico')),
    telefono TEXT,
    email TEXT,
    zona TEXT
);

CREATE TABLE disponibilidad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    franja TEXT NOT NULL CHECK(franja IN ('manana', 'tarde', 'noche')),
    estado TEXT NOT NULL CHECK(estado IN ('disponible', 'no_disponible', 'asignado')),
    UNIQUE(persona_id, fecha, franja)
);

CREATE TABLE eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cliente TEXT,
    tipo TEXT NOT NULL CHECK(tipo IN ('boda', 'corporativo', 'feria', 'presentacion_producto', 'privado', 'otro')),
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    ubicacion TEXT,
    num_invitados INTEGER,
    hora_inicio TEXT,
    hora_fin TEXT,
    presupuesto REAL,
    notas TEXT,
    estado TEXT NOT NULL DEFAULT 'en_negociacion'
        CHECK(estado IN ('en_negociacion', 'confirmado', 'en_curso', 'finalizado', 'cancelado')),
    codigo_acceso TEXT UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE evento_recursos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL CHECK(categoria IN ('personal', 'vehiculo')),
    descripcion TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    asignado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE evento_hitos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    hora TEXT NOT NULL,
    descripcion TEXT NOT NULL
);

CREATE TABLE evento_asignaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    asignado_at TEXT NOT NULL,
    email_enviado_at TEXT,
    recordatorio_enviado_at TEXT,
    UNIQUE(evento_id, persona_id)
);

CREATE TABLE confirmaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
    persona_id INTEGER NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    disponible INTEGER NOT NULL,
    disponible_desde TEXT,
    comentario TEXT,
    respondido_at TEXT NOT NULL,
    UNIQUE(evento_id, persona_id)
);
