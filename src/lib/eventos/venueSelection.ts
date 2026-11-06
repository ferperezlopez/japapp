// Los valores especiales del <select> de lugares del formulario de un evento. Cualquier otro valor
// es el nombre de un lugar ya guardado (o vacío: sin lugar). Los usan el formulario (cliente) y las
// acciones (servidor), por eso viven acá y no en el componente.

/** «+ Nuevo lugar…»: se carga un lugar nuevo (nombre, casa, link) y el evento queda en él. */
export const NEW_VENUE_VALUE = "__new__";

/**
 * «Editar “X”…» (solo al editar un evento): se corrigen el nombre, el link de GPS y de quién es la
 * casa del lugar X, que es el que estaba elegido, y el evento queda en él.
 */
export const EDIT_VENUE_VALUE = "__edit__";
