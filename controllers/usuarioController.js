// controllers/usuarioController.js

import Usuario from "../models/Usuario.js";
import generarJWT from "../helpers/generarJWT.js";
import generarId from "../helpers/generarId.js";
import emailOlvidePassword from "../helpers/emailOlvidePassword.js";
import PerfilUsuario from "../models/PerfiUsuario.js";
import Direccion from "../models/Direccion.js";
import Entidad from "../models/Entidad.js";
import platform from "platform";
import guardarTraza from "../helpers/saveTraza.js";
import { v4 as uuid } from "uuid";
import cloudinary from "../config/claudinary.js";
import { ipAddress, userAgent } from "../helpers/ipAndMetadata.js";

const registrar = async (req, res) => {
  const { email } = req.body;
  // Prevenir usuarios duplicados
  const existeUsuario = await Usuario.findOne({ email });

  if (existeUsuario) {
    const error = new Error("Usuario ya registrado");
    return res.status(400).json({ msg: error.message });
  }
  try {
    // Guardar un usuario
    const usuario = await Usuario.create(req.body);
    // Crear un perfil para el usuario
    const perfil = new PerfilUsuario({
      _id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      tipo_usuario: usuario.tipo_usuario,
    });
    await perfil.save();
    if (
      email === "gsanchez@uci.cu" ||
      email === "victorhernandezsalcedo4@gmail.com"
    ) {
      usuario.tipo_usuario = "Admin_Gnl";
      perfil.tipo_usuario = "Admin_Gnl";
      await usuario.save();
      await perfil.save();
    }
    await guardarTraza({
      entity_name: "Usuarios",
      entity_id: usuario._id,
      action_type: "REGISTRO",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });

    res.json({ msg: "Usuario registrado exitosamente" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Error al registrar el usuario" });
  }
};

const perfil = (req, res) => {
  const { usuario } = req;
  res.json(usuario);
};

const actualizarPerfil = async (req, res) => {
  const { usuario } = req;
  const token = await Usuario.findOne({ tipo_usuario: "Admin_Gnl" });
  let old_value = {};
  let new_value = {};

  try {
    let perfil = await PerfilUsuario.findById(usuario._id);
    let usuarioactual = await Usuario.findById(usuario._id);
    if (!perfil && !usuarioactual) {
      return res.status(404).json({ msg: "Perfil y Usuario no encontrado" });
    }

    if (req.body.nombre && req.body.nombre !== perfil.nombre) {
      // Buscar todas las direcciones asociadas al ejecutivo actual
      const direcciones = await Direccion.find({ ejecutivoId: usuario._id });
      const entidades = await Entidad.find({ ejecutivoId: usuario._id });
      old_value.nombre = perfil.nombre;
      new_value.nombre = req.body.nombre;

      // Actualizar cada dirección individualmente
      if (direcciones) {
        await Promise.all(
          direcciones.map(async (direccion) => {
            try {
              const result = await Direccion.findById(direccion._id);
              await Direccion.findByIdAndUpdate(
                direccion._id,
                { $set: { nombreEjecutivo: req.body.nombre } },
                { new: true }
              );
              await guardarTraza({
                entity_name: "Dirección",
                entity_id: direccion._id,
                old_value: result.nombreEjecutivo,
                new_value: req.body.nombre,
                action_type: "ACTUALIZAR",
                changed_by: usuario.nombre,
                ip_address: ipAddress(req),
                session_id: req.sessionID,
                metadata: userAgent(req),
              });
            } catch (error) {
              console.error(
                `Error al actualizar dirección ${direccion._id}:`,
                error
              );
              return null;
            }
          })
        );
      }

      if (entidades) {
        await Promise.all(
          entidades.map(async (entidad) => {
            try {
              const result = await Entidad.findById(entidad._id);
              await Entidad.findByIdAndUpdate(
                entidad._id,
                { $set: { nombreEjecutivo: req.body.nombre } },
                { new: true }
              );
              await guardarTraza({
                entity_name: "Entidad",
                entity_id: entidad._id,
                old_value: result.nombreEjecutivo,
                new_value: req.body.nombre,
                action_type: "ACTUALIZAR",
                changed_by: usuario.nombre,
                ip_address: ipAddress(req),
                session_id: req.sessionID,
                metadata: userAgent(req),
              });
            } catch (error) {
              console.error(
                `Error al actualizar dirección ${entidad._id}:`,
                error
              );
              return null;
            }
          })
        );
      }
    }
    if (req.body.cargo && req.body.cargo !== perfil.cargo) {
      old_value.cargo = perfil.cargo;
      new_value.cargo = req.body.cargo;
    }
    if (req.body.telefono && req.body.telefono !== perfil.telefono) {
      old_value.telefono = perfil.telefono;
      new_value.cargo = req.body.telefono;
    }
    // Actualizar información del perfil
    perfil = Object.assign(perfil, req.body);
    usuarioactual = Object.assign(usuario, req.body);

    if (req.file) {
      try {
        old_value.fileName = "image_old";
        new_value.fileName = "image_new";
        if (perfil.foto_perfil) {
          const publicId = perfil.foto_perfil.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(publicId);
        }

        // Subir la nueva imagen a Cloudinary usando el buffer
        const result = await cloudinary.uploader.upload(
          `data:${req.file.mimetype};base64,${req.file.buffer.toString(
            "base64"
          )}`,
          {
            public_id: uuid(),
            folder: "perfiles",
          }
        );

        // Guardar la URL de la imagen en el perfil
        perfil.foto_perfil = result.secure_url;
        perfil.originalName = req.file.originalname;
      } catch (error) {
        console.error("Error al subir la imagen a Cloudinary:", error);
        return res
          .status(500)
          .json({ error: "Hubo un error al subir la imagen a Cloudinary" });
      }
    }

    // Guardar los cambios en la base de datos
    await perfil.save();
    await usuarioactual.save();
    await guardarTraza({
      entity_name: "PerfilUsuario",
      entity_id: perfil._id,
      old_value: JSON.stringify(old_value, 2, null),
      new_value: JSON.stringify(new_value, 2, null),
      action_type: "ACTUALIZAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });

    res.json({
      msg: "Perfil actualizado exitosamente",
      perfil: {
        nombre: perfil.nombre,
        cargo: perfil.cargo,
        telefono: perfil.telefono,
        foto_perfil: perfil.foto_perfil,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Error al actualizar el perfil" });
  }
};
const perfilInfo = async (req, res) => {
  const { usuario } = req;
  try {
    const infoperfil = await PerfilUsuario.findById(usuario._id);
    res.json(infoperfil);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Error al Visualizar el perfil" });
  }
};

const autenticar = async (req, res) => {
  const { email, password } = req.body;

  // Verificar si el usuario existe
  const usuario = await Usuario.findOne({ email });
  if (!usuario) {
    const error = new Error("El usuario no existe");
    return res.status(404).json({ msg: error.message });
  }

  // Revisar el password
  const passwordCorrecta = await usuario.comprobarPassword(password);
  if (passwordCorrecta) {
    // Comprobar si el usuario está confirmado
    if (usuario.tipo_usuario === "Sin Asignar") {
      const error = new Error(
        "Su cuenta no puede acceder al sistema sin los permisos correspondientes"
      );
      return res.status(403).json({ msg: error.message });
    }
    // Autenticar
    const perfil = await PerfilUsuario.findOne({ _id: usuario._id })
      .select("-_id")
      .exec();
    res.json({
      _id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      tipo_usuario: usuario.tipo_usuario,
      token: generarJWT(usuario._id),
      foto_perfil: perfil.foto_perfil,
      telefono: perfil.telefono,
      cargo: perfil.cargo,
    });
    await guardarTraza({
      entity_name: "Usuarios",
      action_type: "INICIO_SESION",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
  } else {
    const error = new Error("La contraseña es incorrecta");
    return res.status(403).json({ msg: error.message });
  }
};

const olvidePassword = async (req, res) => {
  const { email } = req.body;

  const existeUsuario = await Usuario.findOne({ email });

  if (!existeUsuario) {
    const error = new Error("El usuario no existe");
    return res.status(400).json({ msg: error.message });
  }

  try {
    existeUsuario.token = generarId();
    await existeUsuario.save();
    // Enviar Email
    emailOlvidePassword({
      email,
      nombre: existeUsuario.nombre,
      token: existeUsuario.token,
    });
    await guardarTraza({
      entity_name: "Usuarios",
      action_type: "RESTABLECER_CONTRASEÑA",
      changed_by: existeUsuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    return res
      .status(200)
      .json({ msg: "Hemos enviado un correo con las instrucciones" });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ msg: "Error al procesar la solicitud de olvidar contraseña" });
  }
};

const comprobarToken = async (req, res) => {
  const { token } = req.params;

  const tokenValido = await Usuario.findOne({ token });

  if (tokenValido) {
    return res.json({
      msg: "Codigo válido. Redireccionando........... ",
      url: `/olvide-password/${token}`,
    });
  } else {
    const error = new Error("Codigo de verificación incorrecto");
    return res.status(400).json({ msg: error.message });
  }
};

const nuevoPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  const usuario = await Usuario.findOne({ token });

  if (!usuario) {
    const error = new Error("Hubo un error");
    return res.status(400).json({ msg: error.message });
  }
  try {
    usuario.token = null;
    usuario.password = password;
    await usuario.save();
    await guardarTraza({
      entity_name: "Usuarios",
      entity_id: usuario._id,
      old_value: "*******",
      new_value: "********",
      action_type: "ACTUALIZAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    res.json({ msg: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Error al actualizar la contraseña" });
  }
};
// Modifica la función visualizarusuarios
const visualizarusuarios = async (req, res) => {
  const { usuario } = req;

  if (usuario.tipo_usuario !== "Admin_Gnl") {
    return res
      .status(400)
      .json({ msg: "No tienes permisos para utilizar esta funcionalidad" });
  }

  try {
    const usuarios = await PerfilUsuario.find();
    // Filtrar los usuarios excluyendo los emails específicos
    const filteredUsers = usuarios.filter((user) => {
      return (
        user.email !== "gsanchez@uci.cu" &&
        user.email !== "victorhernandezsalcedo4@gmail.com"
      );
    });
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Error al visualizar usuarios" });
  }
};

// Función para eliminar usuarios
const eliminarUsuario = async (req, res) => {
  const { id } = req.params;
  const { usuario } = req;
  if (usuario.tipo_usuario !== "Admin_Gnl") {
    return res
      .status(400)
      .json({ msg: "No tienes permisos para eliminar usuarios" });
  }

  try {
    const usuarioToDelete = await Usuario.findById(id);
    const perfilToDelete = await PerfilUsuario.findById(id);

    if (!usuarioToDelete) {
      return res.status(404).json({ msg: "Usuario no encontrado" });
    }
    await guardarTraza({
      entity_name: "Usuarios",
      entity_id: usuarioToDelete._id,
      old_value: {
        nombre: usuarioToDelete.nombre,
        email: usuarioToDelete.email,
        tipo_usuario: usuarioToDelete.tipo_usuario,
        telefono: usuarioToDelete.telefono,
      },
      action_type: "ELIMINAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    await guardarTraza({
      entity_name: "PerfilUsuario",
      entity_id: perfilToDelete._id,
      old_value: {
        nombre: perfilToDelete.nombre,
        cargo: perfilToDelete.cargo,
        email: perfilToDelete.email,
        telefono: perfilToDelete.telefono,
        tipo_usuario: perfilToDelete.tipo_usuario,
      },
      action_type: "ELIMINAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    await perfilToDelete.deleteOne();
    await usuarioToDelete.deleteOne();
    res.json({ msg: "Usuario eliminado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: "Error al eliminar usuario" });
  }
};

// Función para asignar roles
const asignarRoles = async (req, res) => {
  const { usuario } = req;
  const { id, rol } = req.body;
  if (usuario.tipo_usuario !== "Admin_Gnl") {
    return res
      .status(400)
      .json({ msg: "No tienes permisos para asignar roles" });
  }

  try {
    const usuarioasignar = await Usuario.findById(id);
    const perfilAsignar = await PerfilUsuario.findById(id);

    if (!usuarioasignar) {
      return res.status(404).json({ msg: "Usuario no encontrado" });
    }
    if (usuarioasignar.tipo_usuario === rol) {
      return res.status(400).json({
        msg: "El usuario ya tiene asignado este rol, por favor verifique...",
      });
    }
    await guardarTraza({
      entity_name: "Usuarios",
      entity_id: usuarioasignar._id,
      old_value: usuarioasignar.tipo_usuario,
      new_value: rol,
      action_type: "ACTUALIZAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    // Asigna roles al usuario
    usuarioasignar.tipo_usuario = rol;
    perfilAsignar.tipo_usuario = rol;
    await perfilAsignar.save();
    await usuarioasignar.save();

    if (rol === "especialista") {
      const relacionConDirector = await Usuario.findById(req.body.directorId);

      if (!relacionConDirector) {
        return res.status(404).json({ msg: "Director no encontrado" });
      }
      const especialistaRelacionado = await Usuario.findById(id);
      especialistaRelacionado.relacionId = relacionConDirector._id;
      await especialistaRelacionado.save();
      return res.json({ msg: "Rol y permisos asignado  correctamente" });
    }

    return res.json({ msg: "Rol asignado correctamente" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: "Error al asignar roles" });
  }
};

const passchange = async (req, res) => {
  const { usuario } = req;
  const { password, newpassword } = req.body;
  try {
    const usuarioactual = await Usuario.findById(usuario._id);
    //Comprobar password esistente
    const passRigth = await usuarioactual.comprobarPassword(password);
    if (!passRigth) {
      return res
        .status(404)
        .json({ msg: "Su contraseña actual no coincide, verifiquela" });
    }
    usuarioactual.password = newpassword;
    await usuarioactual.save();
    await guardarTraza({
      entity_name: "Usuarios",
      entity_id: usuario._id,
      old_value: "*******",
      new_value: "********",
      action_type: "ACTUALIZAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    return res.json({ msg: "Contraseña cambiada correctamente" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: "Error al cambiar contraseña" });
  }
};

const ponerToken = async (req, res) => {
  const { token } = req.body;
  try {
    const existe = await Usuario.findOne({ tipo_usuario: "Admin_Gnl" });

    existe.accessToken = token;
    await existe.save();
    return res
      .status(200)
      .json({ msg: "Token de archivos agregado o actualizado" });
  } catch (error) {
    console.error("Error:", error);
    return res
      .status(500)
      .json({ msg: "Error al establecer o actualizar el token" });
  }
};

export {
  registrar,
  autenticar,
  olvidePassword,
  comprobarToken,
  nuevoPassword,
  perfil,
  perfilInfo,
  visualizarusuarios,
  eliminarUsuario,
  asignarRoles,
  actualizarPerfil,
  passchange,
  ponerToken,
};
