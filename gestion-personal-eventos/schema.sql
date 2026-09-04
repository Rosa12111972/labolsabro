DROP TABLE IF EXISTS disponibilidad;
DROP TABLE IF EXISTS personas;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);

CREATE TABLE personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('conductor', 'camarero', 'azafata', 'tecnico')),
    telefono TEXT,
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
