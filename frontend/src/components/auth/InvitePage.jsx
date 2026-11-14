import React, { useEffect, useRef } from "react";
import { Network } from "lucide-react";

import { Swal } from "../alerts";
import { SOCKET_URL } from "../constant";

/*
  Shown when someone opens an invitation link from their email while NOT logged in.
  - Reject: works straight away.
  - Accept: the server checks the database. If the email has no CmyRoots account,
    we tell the person to create an account first, then accept the relation.
*/

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const InvitePage = ({ token, onFinished }) => {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        /* 1. load the request details */
        const res = await fetch(`${SOCKET_URL}/api/tree/invite/${encodeURIComponent(token)}/info`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Invitation not found");

        const inv = data.invite;
        const whose = inv.subjectName ? `${inv.subjectName}'s` : "their";

        /* 2. ask for the decision */
        const decision = await Swal.fire({
          title: "Family connection request",
          html:
            `<p><b>${esc(inv.fromName)}</b> says you are ${esc(whose)} <b>${esc(inv.relation)}</b>.</p>` +
            `<p>Do you know this person?<br>Would you like to add this connection to the family tree?</p>` +
            (inv.registered
              ? ""
              : `<p style="font-size:13px;color:#6b7280">To accept, you need a CmyRoots account ` +
                `with <b>${esc(inv.toEmail)}</b>.</p>`),
          icon: "question",
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: "Accept",
          denyButtonText: "Reject",
          cancelButtonText: "Decide later",
          confirmButtonColor: "#15803d",
          denyButtonColor: "#b91c1c",
          allowOutsideClick: false,
        });

        if (decision.isDismissed) return onFinished({ answered: false });

        /* 3. send the answer (public route, no cookie needed) */
        const action = decision.isConfirmed ? "accept" : "reject";
        const out = await fetch(`${SOCKET_URL}/api/tree/invite/${encodeURIComponent(token)}/${action}`, {
          method: "POST",
        });
        const outData = await out.json().catch(() => ({}));

        /* email is not registered in the database -> ask them to create an account first */
        if (out.status === 409 && outData.code === "NO_ACCOUNT") {
          const go = await Swal.fire({
            icon: "warning",
            title: "You don't have an account in CmyRoots",
            html:
              `<p>The email <b>${esc(outData.email || inv.toEmail)}</b> is not registered yet.</p>` +
              `<p>Please <b>create an account</b> with this email, then accept the relation from <b>${esc(inv.fromName)}</b>.</p>`,
            showCancelButton: true,
            confirmButtonText: "Create account",
            cancelButtonText: "Not now",
            confirmButtonColor: "#111",
            allowOutsideClick: false,
          });
          /* keep the token: after signup the request is offered again for Accept / Reject */
          return onFinished({ answered: false, signup: go.isConfirmed });
        }

        if (!out.ok) throw new Error(outData.error || "Could not send your answer");

        if (action === "accept") {
          await Swal.fire({
            icon: "success",
            title: "Connection accepted",
            html: `<p>You are now connected with <b>${esc(inv.fromName)}</b>.</p><p>Log in to see your family tree.</p>`,
            confirmButtonColor: "#111",
          });
        } else {
          await Swal.fire({
            icon: "info",
            title: "Request rejected",
            text: "No connection was added.",
            confirmButtonColor: "#111",
          });
        }
        onFinished({ answered: true });
      } catch (err) {
        await Swal.fire({
          icon: "error",
          title: "Invitation unavailable",
          text: err.message,
          confirmButtonColor: "#111",
        });
        onFinished({ answered: true }); /* bad / used link: drop the token */
      }
    })();
  }, [token, onFinished]);

  return (
    <div className="auth-splash">
      <div>
        <Network size={20} /> CmyRoots family request
      </div>
    </div>
  );
};

export default InvitePage;