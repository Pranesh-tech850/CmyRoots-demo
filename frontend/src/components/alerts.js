import Swal from "sweetalert2";

/* One place for every popup in the app (replaces alert() / confirm()). */
const base = { confirmButtonColor: "#111", confirmButtonText: "OK" };

export const notify = (title, text = "", icon = "info") =>
  Swal.fire({ ...base, title, text, icon });

export const notifyError = (text, title = "Something went wrong") =>
  notify(title, text, "error");

export const notifySuccess = (text, title = "Done") =>
  notify(title, text, "success");

export const toast = (title, icon = "success") =>
  Swal.fire({ toast: true, position: "top-end", timer: 2500, timerProgressBar: true, showConfirmButton: false, icon, title });

/* resolves true / false */
export const confirmDialog = async (title, text, confirmText = "Yes") => {
  const r = await Swal.fire({
    title, text, icon: "warning", showCancelButton: true,
    confirmButtonColor: "#d33", cancelButtonColor: "#777",
    confirmButtonText: confirmText, cancelButtonText: "Cancel",
  });
  return r.isConfirmed;
};

export { Swal };