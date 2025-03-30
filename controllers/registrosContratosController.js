import calcularFechaFin from "../helpers/calcularFecha.js";
import Contrato from "../models/Contratos.js";
import path from "path";
import Factura from "../models/Factura.js";
import getDirectLink from "../helpers/generarLink.js";
import Notification from "../models/Notification.js";
import Direccion from "../models/Direccion.js";
import { Dropbox } from "dropbox";
import Usuario from "../models/Usuario.js";
import moment from "moment";
import parcearDate, { parcearDate3 } from "../helpers/parcearFecha.js";
import guardarTraza from "../helpers/saveTraza.js";
import { ipAddress, userAgent } from "../helpers/ipAndMetadata.js";
import { convertirVigencia } from "../helpers/parceVigencia.js";
import verificarContratosVencidos from "../helpers/contratosVencidos.js";
import TipoContrato from "../models/TipoContrato.js";
import Suplemento from "../models/Suplemento.js";
import calcularFechaFinSuplemento from "../helpers/calcularFechaSuplemento.js";
import diferenciaEnDias from "../helpers/diferenciaEnDias.js";

const registrarContrato = async (req, res) => {
  const { usuario } = req;
  const currentDate = moment().format("YYYYMMDD");

  const token = await Usuario.findOne({ tipo_usuario: "Admin_Gnl" });

  const dbx = await new Dropbox({
    accessToken: token.accessToken,
  });

  // Extraer datos del cuerpo de la solicitud
  const {
    numeroDictamen,
    tipoDeContrato,
    objetoDelContrato,
    entidad,
    direccionEjecuta,
    fechaRecibido,
    valorPrincipal,
    vigencia,
    estado,
    aprobadoPorCC,
    firmado,
    entregadoJuridica,
  } = req.body;
  try {
    const contrato = await Contrato.findOne({
      $and: [
        { numeroDictamen: numeroDictamen },
        { direccionEjecuta: direccionEjecuta },
      ],
    });

    if (contrato && contrato._id) {
      return res.status(403).json({
        msg: `El registro del contrato ${numeroDictamen} ya existe en la ${direccionEjecuta}`,
      });
    }
    if (usuario.tipo_usuario === "especialista") {
      const direcciones = await Direccion.find({ ejecutivoId: relacionId });
      if (direcciones.length === 0) {
        return res
          .status(403)
          .json({ msg: `No tienes permiso a para realizar esta accion` });
      }
      const tienePermisos = direcciones.some(
        (dir) => dir.direccionEjecutiva === direccionEjecuta
      );

      if (!tienePermisos) {
        return res.status(403).json({
          msg: `No tienes permiso para crear un nuevo contrato de esta dirección`,
        });
      }
    }
    if (usuario.tipo_usuario === "director") {
      const direcciones = await Direccion.find({ ejecutivoId: usuario._id });
      if (direcciones.length === 0) {
        return res
          .status(403)
          .json({ msg: `No tienes permiso a para realizar esta accion` });
      }

      const tienePermisos = direcciones.some(
        (dir) => dir.direccionEjecutiva === direccionEjecuta
      );

      if (!tienePermisos) {
        return res.status(403).json({
          msg: `No tienes permiso para crear un nuevo contrato de esta dirección`,
        });
      }
    }
    let newContrato;
    if (req.file) {
      try {
        const archivos = await dbx.filesListFolder({ path: "/Backups" });
      } catch (error) {
        return res.status(403).json({
          msg: "El token del gestor de archivos ha vencido, actualicelo si quiere proceder con la acción",
        });
      }
      const originalnameWithoutExtension = path.parse(
        req.file.originalname
      ).name;
      const customFilename = `${originalnameWithoutExtension}-${currentDate}${path.extname(
        req.file.originalname
      )}`;
      const originalName = req.file.originalname;
      // Subir archivo a Dropbox
      const uploadedFile = await dbx.filesUpload({
        path: "/documentos/" + customFilename,
        contents: req.file.buffer,
        mode: "add",
        autorename: true,
        mute: true,
      });

      // Obtener el link público del archivo
      const publicLink = await dbx.sharingCreateSharedLinkWithSettings({
        path: uploadedFile.result.path_display,
        settings: {
          requested_visibility: {
            ".tag": "public",
          },
        },
      });
      if (
        publicLink.error &&
        publicLink.error.summary === "shared_link_already_exists"
      ) {
        return res
          .status(400)
          .json({ msg: "El archivo ya tiene un vínculo compartido público" });
      }
      const link = getDirectLink(publicLink.result.url);

      newContrato = new Contrato({
        tipoDeContrato: tipoDeContrato || null,
        objetoDelContrato: objetoDelContrato || null,
        entidad: entidad || null,
        direccionEjecuta: direccionEjecuta || null,
        fechaRecibido: fechaRecibido || null,
        valorPrincipal: valorPrincipal || null,
        valorDisponible: valorPrincipal || null, // Si valorPrincipal no existe, será null
        vigencia: vigencia || null,
        fechaVencimiento: valorPrincipal
          ? calcularFechaFin(fechaRecibido, vigencia)
          : null, // Solo calcula si valorPrincipal existe
        estado: estado || null,
        aprobadoPorCC: aprobadoPorCC || null,
        firmado: firmado || null,
        entregadoJuridica: entregadoJuridica || null,
        numeroDictamen: numeroDictamen || null,
        subirPDF: link || "", // Si no hay link, será null
        originalName: originalName || null, // Si no hay originalName, será null
        dropboxPath: uploadedFile?.result?.path_display || null, // Si no hay uploadedFile o path_display, será null
        info: {
          creadoPor: usuario.nombre,
          fechaDeCreacion: new Date().toISOString(),
          modificadoPor: usuario.nombre,
          fechaDeModificacion: new Date().toISOString(),
        },
      });
    } else {
      newContrato = new Contrato({
        tipoDeContrato: tipoDeContrato || null,
        objetoDelContrato: objetoDelContrato || null,
        entidad: entidad || null,
        direccionEjecuta: direccionEjecuta || null,
        fechaRecibido: fechaRecibido || null,
        valorPrincipal: valorPrincipal || null,
        valorDisponible: valorPrincipal || null, // Si valorPrincipal no existe, será null
        vigencia: vigencia || null,
        fechaVencimiento: valorPrincipal
          ? calcularFechaFin(fechaRecibido, vigencia)
          : null,
        estado: estado || null,
        aprobadoPorCC: aprobadoPorCC || null,
        firmado: firmado || null,
        entregadoJuridica: entregadoJuridica || null,
        numeroDictamen: numeroDictamen || null,
        info: {
          creadoPor: usuario.nombre,
          fechaDeCreacion: new Date().toISOString(),
          modificadoPor: usuario.nombre,
          fechaDeModificacion: new Date().toISOString(),
        },
      });
    }

    // Guardar el contrato en la base de datos
    const result = await newContrato.save();
    const newObject = {};

    if (result.tipoDeContrato)
      newObject.Tipo_de_Contrato = result.tipoDeContrato;
    if (result.objetoDelContrato)
      newObject.Objeto_Del_Contrato = result.objetoDelContrato;
    if (result.entidad) newObject.Entidad = result.entidad;
    if (result.direccionEjecuta)
      newObject.Direccion_Ejecutiva = result.direccionEjecuta;
    if (result.fechaRecibido)
      newObject.Fecha_Recibido = parcearDate(result.fechaRecibido);
    if (result.valorPrincipal) newObject.Monto = `$${result.valorPrincipal}`;
    if (result.valorDisponible)
      newObject.Monto_Disponible = `$${result.valorDisponible}`;
    if (result.valorGastado)
      newObject.Monto_Gastado = `$${result.valorGastado}`;
    if (result.vigencia)
      newObject.Vigencia = convertirVigencia(result.vigencia);
    if (result.fechaVencimiento)
      newObject.Fecha_de_Vencimiento = parcearDate(result.fechaVencimiento);
    if (result.estado) newObject.Estado = result.estado;
    if (result.aprobadoPorCC)
      newObject.Aprobado_por_el_CC = parcearDate(result.aprobadoPorCC);
    if (result.firmado) newObject.Firmado = parcearDate(result.firmado);
    if (result.entregadoJuridica)
      newObject.Entregado_a_Juridica = parcearDate(result.entregadoJuridica);
    if (result.numeroDictamen)
      newObject.Numero_de_Dictamen = result.numeroDictamen;
    await guardarTraza({
      entity_name: "Contratos",
      entity_id: result._id,
      new_value: JSON.stringify(newObject, 2, null),
      action_type: "INSERTAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });

    return res.status(200).json({ msg: "Contrato registrado exitosamente" });
  } catch (error) {
    console.error("Error al registrar contrato:", error);
    return res.status(500).json({ error: "Error al registrar contrato" });
  }
};

const obtenerRegistroContratos = async (req, res) => {
  const { usuario } = req;
  const { tipoContrato } = req.params;
  try {
    if (usuario.tipo_usuario === "director") {
      const direcciones = await Direccion.find({ ejecutivoId: usuario._id });

      const contratos = await Contrato.find({
        direccionEjecuta: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
        tipoDeContrato: {
          $in: tipoContrato,
        },
      });
      return res.status(200).json(contratos);
    }
    if (usuario.tipo_usuario === "especialista") {
      const direcciones = await Direccion.find({
        ejecutivoId: usuario.relacionId,
      });
      const contratos = await Contrato.find({
        direccionEjecuta: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
        tipoDeContrato: {
          $in: tipoContrato,
        },
      });

      return res.status(200).json(contratos);
    }
    const allcontract = await Contrato.find({
      tipoDeContrato: {
        $in: tipoContrato,
      },
    });
    return res.status(200).json(allcontract);
  } catch (error) {
    console.error("Error al obtener registros de contratos:", error);
    return res
      .status(500)
      .json({ msg: "Ocurrio un error al listar los  contratos" });
  }
};
const actualizarRegistroContrato = async (req, res) => {
  const token = await Usuario.findOne({ tipo_usuario: "Admin_Gnl" });
  const currentDate = moment().format("YYYYMMDD");

  const dbx = await new Dropbox({
    accessToken: token.accessToken,
  });
  let old_value = {};
  let new_value = {};
  let contratoactual;
  const { id } = req.params;
  const { usuario } = req;
  const bodyRest = { ...req.body };
  delete bodyRest.subirPDF;

  try {
    const contrato = await Contrato.findById(id);
    contratoactual = await Contrato.findById(id);
    if (!contrato) {
      return res.status(404).json({ msg: "Contrato no encontrado" });
    }
    if (req.body.valorPrincipal) {
      if (req.body.valorPrincipal < contrato.valorGastado) {
        return res.status(400).json({
          msg: "El valor del contrato no puede ser menor que el valor  gastado",
        });
      }
    }
    if (req.body.fechaRecibido) {
      // Otra forma de obtener la fecha actual
      const fechaparce = new Date().toISOString();
      if (req.body.fechaRecibido > parcearDate3(new Date(fechaparce))) {
        return res.status(400).json({
          msg: "La fecha de recepción no puede ser  mayor a la fecha actual",
        });
      }
    }

    if (!req.file) {
      contrato.info.modificadoPor = usuario.nombre;
      contrato.info.fechaDeModificacion = new Date().toISOString();

      if (req.body.valorPrincipal) {
        contrato.valorDisponible =
          req.body.valorPrincipal - contrato.valorGastado;
      }
      if (req.body.fechaRecibido) {
        contrato.fechaVencimiento = calcularFechaFin(
          req.body.fechaRecibido,
          req.body.vigencia
        );
      }

      contrato.tipoDeContrato =
        req.body.tipoDeContrato || contrato.tipoDeContrato;
      contrato.objetoDelContrato =
        req.body.objetoDelContrato || contrato.objetoDelContrato;
      contrato.entidad = req.body.entidad || contrato.entidad;
      contrato.direccionEjecuta =
        req.body.direccionEjecuta || contrato.direccionEjecuta;
      contrato.aprobadoPorCC = req.body.aprobadoPorCC || contrato.aprobadoPorCC;
      contrato.firmado = req.body.firmado || contrato.firmado;
      contrato.entregadoJuridica =
        req.body.entregadoJuridica || contrato.entregadoJuridica;
      contrato.fechaRecibido = req.body.fechaRecibido || contrato.fechaRecibido;
      contrato.valorPrincipal =
        parseInt(req.body.valorPrincipal) || contrato.valorPrincipal;
      contrato.valorDisponible =
        parseInt(req.body.valorDisponible) || contrato.valorDisponible;
      contrato.valorGastado =
        parseInt(req.body.valorGastado) || contrato.valorGastado;
      contrato.vigencia = req.body.vigencia || contrato.vigencia;
      contrato.estado = req.body.estado || contrato.estado;
      contrato.numeroDictamen =
        req.body.numeroDictamen || contrato.numeroDictamen;
      await contrato.save();
      if (
        req.body.tipoDeContrato &&
        contrato.tipoDeContrato !== contratoactual.tipoDeContrato
      ) {
        old_value.Tipo_de_Contrato = contratoactual.tipoDeContrato;
        new_value.Tipo_de_Contrato = req.body.tipoDeContrato;
      }
      if (
        req.body.objetoDelContrato &&
        contrato.objetoDelContrato !== contratoactual.objetoDelContrato
      ) {
        old_value.Objeto_Del_Contrato = contratoactual.objetoDelContrato;
        new_value.Tipo_de_Contrato = req.body.objetoDelContrato;
      }
      if (req.body.entidad && contrato.entidad !== contratoactual.entidad) {
        old_value.Entidad = contratoactual.entidad;
        new_value.Entidad = req.body.entidad;
      }
      if (
        req.body.direccionEjecuta &&
        contrato.direccionEjecuta !== contratoactual.direccionEjecuta
      ) {
        old_value.Direccion_Ejecutiva = contratoactual.direccionEjecuta;
        new_value.Direccion_Ejecutiva = req.body.direccionEjecuta;
      }
      if (
        req.body.fechaRecibido &&
        parcearDate(contrato.fechaRecibido) !==
          parcearDate(contratoactual.fechaRecibido)
      ) {
        old_value.Fecha_Recibido = parcearDate(contratoactual.fechaRecibido);
        new_value.Fecha_Recibido = parcearDate(contrato.fechaRecibido);
      }
      if (
        req.body.valorPrincipal &&
        contrato.valorPrincipal !== contratoactual.valorPrincipal
      ) {
        old_value.Monto = `$${contratoactual.valorPrincipal}`;
        new_value.Monto = `$${req.body.valorPrincipal}`;
        old_value.Monto_Disponible = `$${contratoactual.valorDisponible}`;
        new_value.Monto_Disponible = `$${contrato.valorDisponible}`;
      }
      if (req.body.vigencia && contrato.vigencia !== contratoactual.vigencia) {
        old_value.Vigencia = convertirVigencia(contratoactual.vigencia);
        new_value.Vigencia = convertirVigencia(req.body.vigencia);
        old_value.Fecha_de_Vencimiento = parcearDate(
          contratoactual.fechaVencimiento
        );
        new_value.Fecha_de_Vencimiento = parcearDate(contrato.fechaVencimiento);
      }
      if (req.body.estado && contrato.estado !== contratoactual.estado) {
        old_value.Estado = contratoactual.estado;
        new_value.Estado = req.body.estado;
      }
      if (
        req.body.aprobadoPorCC &&
        parcearDate(contrato.aprobadoPorCC) !==
          parcearDate(contratoactual.aprobadoPorCC)
      ) {
        old_value.Aprobado_por_el_CC = parcearDate(
          contratoactual.aprobadoPorCC
        );
        new_value.Aprobado_por_el_CC = parcearDate(contrato.aprobadoPorCC);
      }
      if (
        req.body.firmado &&
        parcearDate(contrato.firmado) !== parcearDate(contratoactual.firmado)
      ) {
        old_value.Firmado = parcearDate(contratoactual.firmado);
        new_value.Firmado = parcearDate(contrato.firmado);
      }
      if (
        req.body.entregadoJuridica &&
        parcearDate(contrato.entregadoJuridica) !==
          parcearDate(contratoactual.entregadoJuridica)
      ) {
        old_value.Entregado_a_Juridica = parcearDate(
          contratoactual.entregadoJuridica
        );
        new_value.Entregado_a_Juridica = parcearDate(
          contrato.entregadoJuridica
        );
      }
      if (
        req.body.numeroDictamen &&
        contrato.numeroDictamen !== contratoactual.numeroDictamen
      ) {
        old_value.Numero_de_Dictamen = contratoactual.numeroDictamen;
        new_value.Numero_de_Dictamen = req.body.numeroDictamen;
      }
      await guardarTraza({
        entity_name: "Contratos",
        entity_id: contrato._id,
        old_value: JSON.stringify({ Valores_anteriores: old_value }, 2, null),
        new_value: JSON.stringify({ Valores_nuevos: new_value }, 2, null),
        action_type: "ACTUALIZAR",
        changed_by: usuario.nombre,
        ip_address: ipAddress(req),
        session_id: req.sessionID,
        metadata: userAgent(req),
      });
      return res
        .status(200)
        .json({ msg: "Contrato actualizado exitosamente", contrato });
    }
    try {
      const archivos = await dbx.filesListFolder({ path: "/Backups" });
    } catch (error) {
      return res.status(403).json({
        msg: "El token del gestor de archivos ha vencido, actualicelo si quiere proceder con la acción",
      });
    }
    const originalnameWithoutExtension = path.parse(req.file.originalname).name;
    const customFilename = `${originalnameWithoutExtension}-${currentDate}${path.extname(
      req.file.originalname
    )}`;
    const originalName = req.file.originalname;
    if (contrato.dropboxPath) {
      await dbx.filesDeleteV2({
        path: contrato.dropboxPath,
      });

      console.log(
        "Archivo existente eliminado de la nube:",
        contrato.originalName
      );
    }
    // Subir archivo a Dropbox
    const uploadedFile = await dbx.filesUpload({
      path: "/documentos/" + customFilename,
      contents: req.file.buffer,
      mode: "add",
      autorename: true,
      mute: true,
    });

    // Obtener el link público del archivo
    const publicLink = await dbx.sharingCreateSharedLinkWithSettings({
      path: uploadedFile.result.path_display,
      settings: {
        requested_visibility: {
          ".tag": "public",
        },
      },
    });
    const link = getDirectLink(publicLink.result.url);

    contrato.info.modificadoPor = usuario.nombre;
    contrato.info.fechaDeModificacion = new Date().toISOString();
    contrato.dropboxPath = uploadedFile.result.path_display;
    contrato.originalName = originalName;
    contrato.subirPDF = link;
    contrato.tipoDeContrato =
      req.body.tipoDeContrato || contrato.tipoDeContrato;
    contrato.objetoDelContrato =
      req.body.objetoDelContrato || contrato.objetoDelContrato;
    contrato.entidad = req.body.entidad || contrato.entidad;
    contrato.direccionEjecuta =
      req.body.direccionEjecuta || contrato.direccionEjecuta;
    contrato.aprobadoPorCC = req.body.aprobadoPorCC || contrato.aprobadoPorCC;
    contrato.firmado = req.body.firmado || contrato.firmado;
    contrato.entregadoJuridica =
      req.body.entregadoJuridica || contrato.entregadoJuridica;
    contrato.fechaRecibido = req.body.fechaRecibido || contrato.fechaRecibido;
    contrato.valorPrincipal =
      parseInt(req.body.valorPrincipal) || contrato.valorPrincipal;
    contrato.valorDisponible =
      parseInt(req.body.valorDisponible) || contrato.valorDisponible;
    contrato.valorGastado =
      parseInt(req.body.valorGastado) || contrato.valorGastado;
    contrato.vigencia = req.body.vigencia || contrato.vigencia;
    contrato.estado = req.body.estado || contrato.estado;
    contrato.numeroDictamen =
      req.body.numeroDictamen || contrato.numeroDictamen;
    await contrato.save();

    if (req.body.valorPrincipal) {
      contrato.valorDisponible =
        req.body.valorPrincipal - contrato.valorGastado;
    }
    if (req.body.fechaRecibido) {
      contrato.fechaVencimiento = calcularFechaFin(
        contrato.fechaRecibido,
        contrato.vigencia
      );
    }
    await contrato.save();
    return res
      .status(200)
      .json({ msg: "Contrato actualizado exitosamente", contrato });
  } catch (error) {
    console.error("Ha ocurrido un error al actualizar:", error);
    return res
      .status(500)
      .json({ msg: "Error al intentar actualizar el registro" });
  }
};

const eliminarRegistroContrato = async (req, res) => {
  const { id } = req.params;
  const { usuario } = req;
  const token = await Usuario.findOne({ tipo_usuario: "Admin_Gnl" });

  const dbx = await new Dropbox({
    accessToken: token.accessToken,
  });
  try {
    const contrato = await Contrato.findById(id);
    if (contrato.subirPDF) {
      const archivos = await dbx.filesListFolder({ path: "/Backups" });
    }
  } catch (error) {
    return res.status(403).json({
      msg: "El token del gestor de archivos ha vencido, actualicelo si quiere proceder con la acción",
    });
  }
  try {
    const contrato = await Contrato.findById(id);
    if (!contrato) {
      return res.status(404).json({ msg: "Contrato no encontrado" });
    }
    const facturas = await Factura.find({ contratoId: id });
    if (facturas.length > 0) {
      await Factura.deleteMany({ contratoId: id });
    }
    const notificaciones = await Notification.findOne({ contratoId: id });
    if (notificaciones) {
      await Notification.deleteOne({ contratoId: id });
    }
    if (contrato.dropboxPath) {
      await dbx.filesDeleteV2({
        path: contrato.dropboxPath,
      });
    }

    await guardarTraza({
      entity_name: "Contratos",
      entity_id: contrato._id,
      old_value: JSON.stringify(
        {
          Tipo_de_Contrato: contrato.tipoDeContrato,
          Objeto_Del_Contrato: contrato.objetoDelContrato,
          Entidad: contrato.entidad,
          Direccion_Ejecutiva: contrato.direccionEjecuta,
          Fecha_Recibido: parcearDate(contrato.fechaRecibido),
          Monto: `$${contrato.valorPrincipal}`,
          Monto_Disponible: `$${contrato.valorDisponible}`,
          Monto_Gastado: `$${contrato.valorGastado}`,
          Vigencia: convertirVigencia(contrato.vigencia),
          Fecha_de_Vencimiento: parcearDate(contrato.fechaVencimiento),
          Estado: contrato.estado,
          Aprobado_por_el_CC: parcearDate(contrato.aprobadoPorCC),
          Firmado: parcearDate(contrato.firmado),
          Entregado_a_Juridica: parcearDate(contrato.entregadoJuridica),
          Numero_de_Dictamen: contrato.numeroDictamen,
        },
        2,
        null
      ),
      action_type: "ELIMINAR",
      changed_by: usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    await contrato.deleteOne();
    return res.status(200).json({ msg: "Contrato eliminado exitosamente" });
  } catch (error) {
    console.error("Ha ocurrido un error al eliminar:", error);
    return res
      .status(500)
      .json({ msg: "Error al intentar eliminar el registro" });
  }
};

const obtenerContratosFiltrados = async (req, res) => {
  const { estado, direccionEjecuta, entidad, tipoContrato } = req.body;
  const { usuario } = req;

  try {
    let query = {};
    query.tipoDeContrato = tipoContrato;

    if (estado) {
      query.estado = estado;
    }

    if (direccionEjecuta) {
      query.direccionEjecuta = direccionEjecuta;
    }

    if (entidad) {
      query.entidad = entidad;
    }
    if (usuario.tipo_usuario === "director") {
      const direcciones = await Direccion.find({ ejecutivoId: usuario._id });
      const contratos = await Contrato.find({
        direccionEjecuta: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
        ...query, // Asegúrate de que 'query' esté definido antes de esta línea
      });

      // Filtra los contratos según la query si es necesario
      const filteredContratos = contratos.filter((item) =>
        Object.keys(query).every((key) => item[key] === query[key])
      );

      return res.status(200).json(filteredContratos);
    }
    if (usuario.tipo_usuario === "especialista") {
      const direcciones = await Direccion.find({
        ejecutivoId: usuario.relacionId,
      });
      const contratos = await Contrato.find({
        direccionEjecuta: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
        ...query, // Asegúrate de que 'query' esté definido antes de esta línea
      });

      // Filtra los contratos según la query si es necesario
      const filteredContratos = contratos.filter((item) =>
        Object.keys(query).every((key) => item[key] === query[key])
      );

      return res.status(200).json(filteredContratos);
    }

    const contratos = await Contrato.find(query);
    return res.status(200).json(contratos);
  } catch (error) {
    console.error("Ha ocurrido un error al obtener los contratos:", error);
    return res
      .status(500)
      .json({ msg: "Error al intentar obtener los contratos" });
  }
};

const notificarcontratos = async (req, res) => {
  const { usuario } = req;
  try {
    let contratos;
    let notificaciones;
    const hoy = new Date();
    const fechaLimite = new Date(hoy);
    fechaLimite.setDate(hoy.getDate() + 30); // Fecha límite para los contratos que están por vencer

    // Función para crear una notificación si no existe
    const createNotificationIfNotExists = async (contratoId) => {
      const existingNotification = await Notification.findOne({
        contratoId: contratoId,
      });

      if (!existingNotification) {
        const contrato = await Contrato.findById(contratoId);
        if (!contrato) {
          console.log(`Contrato con ID ${contratoId} no encontrado`);
          return;
        }

        const notification = new Notification({
          description: `El contrato ${contrato.numeroDictamen} está por vencer.`,
          direccionEjecutiva: contrato.direccionEjecuta,
          contratoId: contrato._id,
          fechaVencimiento: contrato.fechaVencimiento,
          entidad: contrato.entidad,
          valorDisponible: contrato.valorDisponible,
        });
        await notification.save();
        console.log(
          `Notificación creada para el contrato ${contrato.numeroDictamen}`
        );
      } else {
      }
    };

    // Acceso completo a todos los contratos que están por vencer
    contratos = await Contrato.find({
      fechaVencimiento: { $gte: hoy, $lte: fechaLimite }, // Contratos que van a vencer en 30 días
    });

    if (!contratos || contratos.length === 0) {
    } else {
      // Crear notificaciones para cada contrato si no existe una
      await Promise.all(
        [...new Set(contratos.map((c) => c._id))].map(async (id) => {
          await createNotificationIfNotExists(id);
        })
      );
    }
    if (usuario.tipo_usuario === "director") {
      const direcciones = await Direccion.find({ ejecutivoId: usuario._id });

      const notificacionesServicios = await Notification.find({
        direccionEjecutiva: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
        readByDirector: false,
      });

      return res.status(200).json(notificacionesServicios);
    }
    if (usuario.tipo_usuario === "especialista") {
      const direcciones = await Direccion.find({
        ejecutivoId: usuario.relacionId,
      });

      const notificacionesServicios = await Notification.find({
        direccionEjecutiva: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
        readByEspecialista: false,
      });

      return res.status(200).json(notificacionesServicios);
    }
    const allNotification = await Notification.find({
      readByAdmin: false,
    });
    return res.status(200).json(allNotification);
  } catch (error) {
    console.error("Ha ocurrido un error al obtener los contratos:", error);
    return res
      .status(500)
      .json({ msg: "Error al intentar obtener los contratos" });
  }
};
const marcarComoLeidas = async (req, res) => {
  const { usuario } = req;
  const { id } = req.params;

  try {
    const notificacion = await Notification.findById(id);

    if (notificacion) {
      if (usuario.tipo_usuario === "director") {
        notificacion.readByDirector = true;
      }
      if (usuario.tipo_usuario === "especialista") {
        notificacion.readByEspecialista = true;
      }
      notificacion.readByAdmin = true;
      notificacion.readByEspecialista = true;
      notificacion.readByDirector = true;
      // Actualizar la notificación en la base de datos
      const updatedNotification = await notificacion.save();
      return res.status(200).json({
        msg: "Notificación eliminada correctamente",
        updatedNotification,
      });
    } else {
      return res.status(404).json({ msg: "Notificación no encontrada" });
    }
  } catch (error) {
    console.error("Ha ocurrido un error:", error);
    return res
      .status(500)
      .json({ msg: "Error al intentar marcar la notificación como leída" });
  }
};

const marcarleidasAll = async (req, res) => {
  const { usuario } = req;
  try {
    if (usuario.tipo_usuario === "director") {
      const direcciones = await Direccion.find({ ejecutivoId: usuario._id });
      const notificaciones = await Notification.find({
        readBySer: false,
        direccionEjecutiva: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
      });
      await Promise.all(
        notificaciones.map(async (notificacion) => {
          notificacion.readByDirector = true;
          return notificacion;
        })
      );
      await Notification.bulkWrite(
        notificaciones.map((n) => ({
          updateOne: {
            filter: { _id: n._id },
            update: { $set: { readByDirector: true } },
          },
        }))
      );
      return res.status(200).json({
        msg: "Se han limpiado todas las notificaciones correctamente",
      });
    }
    if (usuario.tipo_usuario === "especialista") {
      const direcciones = await Direccion.find({
        ejecutivoId: usuario.relacionId,
      });
      const notificaciones = await Notification.find({
        readByEspecialista: false,
        direccionEjecutiva: {
          $in: direcciones.map((direccion) => direccion.direccionEjecutiva),
        },
      });
      await Notification.bulkWrite(
        notificaciones.map((n) => ({
          updateOne: {
            filter: { _id: n._id },
            update: { $set: { readByEspecialista: true } },
          },
        }))
      );
      return res.status(200).json({
        msg: "Se han limpiado todas las notificaciones correctamente",
      });
    }

    const notificaciones = await Notification.find({ readByAdmin: false });
    await Promise.all(
      notificaciones.map(async (notificacion) => {
        notificacion.readByAdmin = true;
        return notificacion;
      })
    );
    await Notification.bulkWrite(
      notificaciones.map((n) => ({
        updateOne: {
          filter: { _id: n._id },
          update: { $set: { readByAdmin: true } },
        },
      }))
    );
    return res.status(200).json({
      msg: "Se han limpiado todas las notificaciones correctamente",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Error al intentar marcar la notificación como leída",
      error,
    });
  }
};

const eliminarNotificacionesArchivadas = async () => {
  try {
    const notificacionesleidas = await Notification.find({
      readByAdmin: true,
      readByDirector: true,
      readByEspecialista: true,
    });
    if (!notificacionesleidas || notificacionesleidas.length === 0) {
      console.log("No hay notificaciones que eliminar");
      return;
    }

    const resultadoEliminacion = await Notification.deleteMany({
      readByAdmin: true,
      readByDirector: true,
      readByEspecialista: true,
    });
    console.log(
      `Se han eliminado ${resultadoEliminacion.deletedCount} notificación`
    );
  } catch (error) {
    console.error(
      "Ha ocurrido un error al eliminar las notificaciones leidas:",
      error
    );
  }
};

const cambiarEstado = async () => {
  try {
    // Obtener la fecha actual
    const currentDate = new Date();

    // Buscar todos los contratos activos
    const contratosActivos = await Contrato.find({ estado: "Ejecución" });
    // Verificar contratos vencidos usando la función reutilizable
    const contratosVencidos = verificarContratosVencidos(
      contratosActivos,
      currentDate
    );

    if (!contratosVencidos || contratosVencidos.length === 0) {
      console.log("No hay contratos vencidos");
      return;
    }
    console.log(`Se ha vencido ${contratosVencidos.length} contratos`);
    // Actualizar el estado de los contratos vencidos
    await Contrato.updateMany(
      { _id: { $in: contratosVencidos.map((c) => c._id) } }, // Filtra por IDs de contratos vencidos
      { $set: { estado: "Finalizado" } }
    );

    // Actualizar las notificaciones para los contratos vencidos
    const notificaciones = await Notification.find();
    // Obtener los IDs de los contratos vencidos
    const contratosVencidosIds = contratosVencidos.map((c) => c._id.toString());

    const notificacionesParaActualizar = notificaciones.filter((n) =>
      contratosVencidosIds.includes(n.contratoId.toString())
    );

    for (const notificacion of notificacionesParaActualizar) {
      // Obtener el número de dictamen del contrato asociado
      const contrato = await Contrato.findById(notificacion.contratoId);
      const numeroDictamen = contrato.numeroDictamen;

      // Construir la nueva descripción con el número de dictamen
      const nuevaDescripcion = `El contrato ${numeroDictamen} ha finalizado su tiempo de contratación`;

      // Actualizar la descripción de la notificación
      notificacion.description = nuevaDescripcion;

      // Guardar los cambios en la base de datos
      await notificacion.save();
    }
    console.log(
      `Se ha actualizado ${notificacionesParaActualizar.length} notificaciones`
    );
  } catch (error) {
    console.error(
      "Error al actualizar estados de contratos y notificaciones",
      error
    );
  }
};

//Crear suplemento
const crearSuplemento = async (req, res) => {
  try {
    const { id } = req.params;
    // Verificar si el contrato existe
    const existeContrato = await Contrato.findById(id);
    if (!existeContrato) {
      return res.status(404).json({
        msg: `El contrato con id ${id} no existe`,
      });
    }

    // Crear el suplemento
    const suplemento = await Suplemento.create({
      ...req.body,
    });

    existeContrato.isGotSupplement = true;
    await existeContrato.save();
    // Justo después de crear el suplemento
    await guardarTraza({
      entity_name: "Suplemento",
      entity_id: suplemento._id,
      new_value: JSON.stringify(suplemento.toObject()),
      action_type: "INSERTAR",
      changed_by: req.usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    return res.status(201).json({
      msg: `Suplemento(s) creado(s) correctamente para el contrato ${existeContrato.numeroDictamen}`,
      suplemento,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Error al crear el suplemento",
      error: error.message,
    });
  }
};

// Obtener todos los suplementos de un contrato
const getSuplementosByContrato = async (req, res) => {
  try {
    const { id } = req.params;
    const contrato = await Contrato.findById(id);
    const suplementos = await Suplemento.find({ contratoId: id }).sort({
      createdAt: -1,
    }); // Ordenar por fecha de creación descendente

    if (suplementos.length === 0) {
      contrato.isGotSupplement = false;
      await contrato.save();
      return res.status(200).json(suplementos);
    }

    return res.status(200).json(suplementos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Error al obtener los suplementos",
      error: error.message,
    });
  }
};

// Actualizar suplemento
const actualizarSuplemento = async (req, res) => {
  try {
    const { id } = req.params;

    const suplementoActualizado = await Suplemento.findByIdAndUpdate(
      id,
      req.body,
      { new: true } // Retorna el documento actualizado
    );

    if (!suplementoActualizado) {
      return res.status(404).json({
        msg: `No se encontró el suplemento con id ${id}`,
      });
    }
    // Después de obtener suplementoActualizado
    await guardarTraza({
      entity_name: "Suplemento",
      entity_id: id,
      old_value: JSON.stringify(req.body),
      new_value: JSON.stringify(suplementoActualizado.toObject()),
      action_type: "ACTUALIZAR",
      changed_by: req.usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    return res.status(200).json({
      msg: "Suplemento actualizado correctamente",
      suplemento: suplementoActualizado,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Error al actualizar el suplemento",
      error: error.message,
    });
  }
};

// Eliminar suplemento
const eliminarSuplemento = async (req, res) => {
  try {
    const { id } = req.params;

    const suplementoEliminado = await Suplemento.findByIdAndDelete(id);

    if (!suplementoEliminado) {
      return res.status(404).json({
        msg: `No se encontró el suplemento con id ${id}`,
      });
    }
    // Antes de eliminar el suplemento
    await guardarTraza({
      entity_name: "Suplemento",
      entity_id: id,
      old_value: JSON.stringify(suplementoEliminado.toObject()),
      action_type: "ELIMINAR",
      changed_by: req.usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    return res.status(200).json({
      msg: "Suplemento eliminado correctamente",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      msg: "Error al eliminar el suplemento",
      error: error.message,
    });
  }
};
const useSupplement = async (req, res) => {
  const { id } = req.params;
  try {
    const supplementToUse = await Suplemento.findById(id);
    const contract = await Contrato.findById(supplementToUse.contratoId);

    if (!supplementToUse) {
      return res.status(404).json({
        msg: `No se encontró el suplemento con id ${id}`,
      });
    }

    await contract.updateOne(
      {
        $push: {
          // Usa $push para agregar un nuevo elemento al array
          supplement: {
            nombre: supplementToUse.nombre,
            tiempo: supplementToUse.tiempo,
            monto: supplementToUse.monto,
            montoOriginal: supplementToUse.monto,
          },
        },
      },
      { new: true }
    );
    if (supplementToUse.tiempo) {
      contract.fechaVencimiento = calcularFechaFinSuplemento(
        contract.fechaVencimiento,
        supplementToUse.tiempo
      );
    }

    await supplementToUse.deleteOne();
    await contract.save();
    const existNotification = await Notification.find({
      contratoId: contract.id,
    });
    if (existNotification) {
      if (
        diferenciaEnDias(contract.fechaRecibido, contract.fechaVencimiento) > 30
      )
        await Notification.findByIdAndDelete(existNotification._id);
    }
    // Después de actualizar el contrato y antes de eliminar el suplemento
    await guardarTraza({
      entity_name: "Suplemento",
      entity_id: id,
      old_value: JSON.stringify(supplementToUse.toObject()),
      action_type: "USAR",
      changed_by: req.usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });

    // Traza adicional para la modificación del contrato
    await guardarTraza({
      entity_name: "Contrato",
      entity_id: contract._id,
      new_value: JSON.stringify({
        supplement: contract.supplement[contract.supplement.length - 1],
        fechaVencimiento: contract.fechaVencimiento
      }),
      action_type: "ACTUALIZAR",
      changed_by: req.usuario.nombre,
      ip_address: ipAddress(req),
      session_id: req.sessionID,
      metadata: userAgent(req),
    });
    return res.status(200).json({
      msg: `El suplemento se agregado correctamente al contrato ${contract.numeroDictamen}`,
      contract,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      msg: "Error al usar el suplemento",
      error: error.message,
    });
  }
};
export {
  registrarContrato,
  obtenerRegistroContratos,
  actualizarRegistroContrato,
  eliminarRegistroContrato,
  obtenerContratosFiltrados,
  notificarcontratos,
  marcarComoLeidas,
  eliminarNotificacionesArchivadas,
  marcarleidasAll,
  cambiarEstado,
  crearSuplemento,
  getSuplementosByContrato,
  actualizarSuplemento,
  eliminarSuplemento,
  useSupplement,
};
