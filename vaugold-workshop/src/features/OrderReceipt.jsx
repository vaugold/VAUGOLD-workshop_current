// src/features/OrderReceipt.jsx
import React, { useState } from 'react';
import { fmt, fmtDate } from '../utils/helpers';
import { calcOrder } from '../utils/calculations';
import { MFG_TYPES_BILINGUAL } from '../utils/constants';

// Эстонские/английские переводы типов оплаты
const T = {
  et: {
    payMethod: {
      "Sularaha VAUGOLD": "Sularaha",
      "Sularaha EM": "Sularaha",
      "Kaart VAUGOLD": "Kaardimakse",
      "Kaart EM": "Kaardimakse",
      "Pank VAUGOLD": "Pangaülekanne",
      "Pank EM": "Pangaülekanne"
    },
    metal: "Antud metall",
    comment: "Märkus",
    extras: "Lisad",
    subtotal: "Summa ilma KM-ta",
    vat: "KM 24%",
    total: "Tasuda kokku",
    prepaid: "Ettemaks",
    remaining: "Järelejääv summa",
    received: "Vastuvõtmise kuupäev",
    reg: "Reg. nr",
    phone: "Tel"
  },
  en: {
    payMethod: {
      "Sularaha VAUGOLD": "Cash",
      "Sularaha EM": "Cash",
      "Kaart VAUGOLD": "Card",
      "Kaart EM": "Card",
      "Pank VAUGOLD": "Bank transfer",
      "Pank EM": "Bank transfer"
    },
    metal: "Metal given",
    comment: "Comment",
    extras: "Extras",
    subtotal: "Subtotal",
    vat: "VAT 24%",
    total: "Total",
    prepaid: "Prepaid",
    remaining: "Remaining",
    received: "Order date",
    reg: "Reg. nr",
    phone: "Tel"
  }
};

// Перевод типа изделия на эстонский
const toEt = (ru) => {
  if (!ru) return "";
  const found = MFG_TYPES_BILINGUAL.find(p => p[0] === ru);
  return found ? found[1] : ru;
};

// CSS для печати чека
const RECEIPT_CSS = `
  .rr-wrap { font-family: "DM Sans", sans-serif; background: #fff; max-width: 380px; margin: 0 auto; color: #333; padding: 20px; }
  .rr-page { page-break-after: always; }
  .rr-reg { font-size: 10px; color: #555; line-height: 1.8; }
  .rr-hr { border: none; border-top: 1px solid #aaa; margin: 10px 0; }
  .rr-lbl { font-size: 8px; font-weight: 400; text-transform: uppercase; letter-spacing: .09em; color: #999; margin-bottom: 2px; margin-top: 8px; }
  .rr-val { font-size: 13px; color: #2C1F33; margin-bottom: 2px; font-weight: 500; }
  .rr-total-box { border: 1.5px solid #555; border-radius: 4px; padding: 12px 14px; margin-top: 10px; }
  .rr-trow { display: flex; justify-content: space-between; font-size: 12px; color: #826B87; padding: 2px 0; }
  .rr-trow-big { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #111; padding-top: 8px; margin-top: 6px; border-top: 2px solid #333; }
  .rr-trow-bal { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #B03060; padding-top: 6px; margin-top: 4px; border-top: 1px dashed #999; }
  .rr-date { font-size: 10px; color: #555; margin-top: 12px; }
  .rr-comment-box { background: #f8f9fa; border-radius: 6px; padding: 7px 9px; font-size: 12px; color: #555; line-height: 1.5; }
  .rr-extra-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; color: #444; }
  .rr-extra-row span:first-child { flex: 1; }
  .rr-meta { font-size: 10px; color: #555; display: flex; justify-content: space-between; margin: 4px 0; }
  .rr-task-box { background: #fff8e6; border-left: 3px solid #d4a017; padding: 8px 12px; font-size: 13px; margin-top: 8px; }
  .rr-metal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
  .rr-metal-cell { border: 1px solid #ddd; border-radius: 6px; padding: 10px; }
  .rr-metal-cell-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
  .rr-metal-cell-val { font-size: 14px; font-weight: 600; color: #333; }
  .rr-hr-d { border: none; border-top: 1px dashed #ccc; margin: 10px 0; }
  .rr-num { font-size: 16px; font-weight: 600; color: #2C1F33; }
  .rr-finale-box { border: 1px solid #2C1F33; border-radius: 8px; padding: 14px; margin-top: 12px; }
  @media print { .no-print { display: none !important; } .rr-wrap { page-break-after: always; } }
`;

export const OrderReceipt = ({ order, onClose, customTypes = [] }) => {
  const [mode, setMode] = useState("client"); // client | master | finale
  const [masterLang, setMasterLang] = useState("ru");
  const [copies, setCopies] = useState(1);

  const oc = calcOrder(order);

  // Фильтруем только видимые доп. позиции (с описанием или ценой)
  const xvis = (order.extras || []).filter(e => e.description || parseFloat(e.price) > 0);

  // Перевод типов оплаты
  const payEt = T.et.payMethod[order.paymentMethod] || order.paymentMethod;
  const payEn = T.en.payMethod[order.paymentMethod] || order.paymentMethod;
  const finalPayEt = T.et.payMethod[order.finalPaymentMethod] || order.finalPaymentMethod;
  const finalPayEn = T.en.payMethod[order.finalPaymentMethod] || order.finalPaymentMethod;

  // Печать
  const doPrint = () => {
    const style = document.createElement("style");
    style.id = "__copies_style";
    style.textContent = copies > 1 ? `.rr-page { page-break-after: always; }` : "";
    document.head.appendChild(style);

    const wrap = document.querySelector(".rr-wrap");
    const origHTML = wrap ? wrap.innerHTML : "";
    if (copies > 1 && wrap) {
      let repeated = "";
      for (let i = 0; i < copies; i++) repeated += origHTML;
      wrap.innerHTML = repeated;
    }

    window.print();

    if (copies > 1 && wrap) wrap.innerHTML = origHTML;
    const s = document.getElementById("__copies_style");
    if (s) s.remove();
  };

  // Блок для клиента
  const ClientBlock = () => (
    <div className="rr-page">
      <div className="rr-reg" style={{ fontSize: 19, fontWeight: 600, letterSpacing: ".04em", color: "#2C1F33", marginBottom: 4 }}>VAUGOLD OÜ</div>
      <div className="rr-reg">{T.et.reg} 16997581 &nbsp;·&nbsp; {T.et.phone} +372 56662363</div>
      <hr className="rr-hr" />

      {order.orderNumber && (
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, color: '#2C1F33', marginBottom: 6 }}>№ {order.orderNumber}</div>
      )}
      {order.serviceType && (
        <div style={{ fontSize: 14, color: '#826B87', marginBottom: 6, fontStyle: 'italic' }}>{toEt(order.serviceType)}</div>
      )}

      {(order.clientName || order.clientPhone) && (
        <div className="rr-val">{order.clientName}{order.clientName && order.clientPhone ? " · " : ""}{order.clientPhone}</div>
      )}

      {order.metalGiven && (
        <>
          <div className="rr-lbl">{T.et.metal}</div>
          <div className="rr-val">{order.metalGiven} g{order.withStones && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#111" }}>[ KIVIDEGA ]</span>}</div>
        </>
      )}

      {order.comment && (
        <>
          <div className="rr-lbl">{T.et.comment}</div>
          <div className="rr-comment-box">{order.comment}</div>
        </>
      )}

      {xvis.length > 0 && (
        <>
          <div className="rr-lbl" style={{ marginTop: 8 }}>{T.et.extras}</div>
          {xvis.map((e, i) => (
            <div className="rr-extra-row" key={i}>
              <span>{e.description || e.type || "—"}</span>
              <span>{fmt(e.price)}</span>
            </div>
          ))}
        </>
      )}

      <div className="rr-total-box">
        {oc.vat > 0 && <div className="rr-trow"><span>{T.et.subtotal}</span><span>{fmt(oc.clientTotal)}</span></div>}
        {oc.vat > 0 && <div className="rr-trow"><span>{T.et.vat}</span><span>+{fmt(oc.vat)}</span></div>}
        <div className="rr-trow-big">
          <span>{T.et.total}</span>
          <span>{fmt(oc.clientTotalWithVat)}</span>
        </div>
        {oc.prepayment > 0 && (
          <>
            <div className="rr-trow" style={{ marginTop: 7 }}>
              <span>{T.et.prepaid} · {payEt}</span>
              <span>−{fmt(oc.prepayment)}</span>
            </div>
            <div className="rr-trow-bal">
              <span>{T.et.remaining}</span>
              <span>{fmt(oc.balance)}</span>
            </div>
          </>
        )}
      </div>

      <div className="rr-date">{T.et.received}: {fmtDate(order.orderDate)}</div>
    </div>
  );

  // Блок для мастера
  const MasterBlock = () => (
    <div className="rr-page">
      {order.orderTitle ? (
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 23, color: '#2C1F33', letterSpacing: '.01em', marginBottom: 3, lineHeight: 1.2 }}>{order.orderTitle}</div>
      ) : (
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '.04em', color: '#2C1F33', marginBottom: 2 }}>VAUGOLD OÜ</div>
      )}
      <div style={{ fontSize: 14, color: '#826B87', marginBottom: 2 }}>№ {order.orderNumber || "—"}</div>
      <div className="rr-meta">
        <span>Дата приёма: {fmtDate(order.orderDate)}</span>
        {order.deadline && <span style={{ color: "#B03060", fontWeight: 600 }}>Дедлайн: {fmtDate(order.deadline)}</span>}
      </div>
      <hr className="rr-hr" />

      {(order.clientName || order.clientPhone) && (
        <>
          <div className="rr-lbl">Клиент</div>
          <div className="rr-val">{order.clientName}{order.clientName && order.clientPhone ? " · " : ""}{order.clientPhone}</div>
        </>
      )}

      {order.metalGiven && (
        <>
          <div className="rr-lbl">Дано металла</div>
          <div className="rr-val">{order.metalGiven} g{order.withStones && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700 }}>[ KIVIDEGA ]</span>}</div>
        </>
      )}

      {order.masterTask && (
        <>
          <div className="rr-lbl" style={{ marginTop: 10 }}>ТЗ</div>
          <div className="rr-task-box">{order.masterTask}</div>
        </>
      )}

      <hr className="rr-hr-d" />
      <div className="rr-lbl">Итоговый вес</div>
      <div className="rr-metal-grid">
        <div className="rr-metal-cell">
          <div className="rr-metal-cell-label">Итоговый вес</div>
          <div className="rr-metal-cell-val">________________</div>
        </div>
        <div className="rr-metal-cell">
          <div className="rr-metal-cell-label">Вес с потерей</div>
          <div className="rr-metal-cell-val">________________</div>
        </div>
        <div className="rr-metal-cell">
          <div className="rr-metal-cell-label">Надо добавить</div>
          <div className="rr-metal-cell-val">________________</div>
        </div>
        <div className="rr-metal-cell">
          <div className="rr-metal-cell-label">К возврату</div>
          <div className="rr-metal-cell-val">________________</div>
        </div>
      </div>

      {order.comment && (
        <>
          <div className="rr-lbl" style={{ marginTop: 10 }}>Комментарий</div>
          <div className="rr-comment-box">{order.comment}</div>
        </>
      )}

      <div className="rr-date" style={{ marginTop: 16 }}>Дата завершения: ____________________</div>
    </div>
  );

  // Блок "Projekti tulemus" (финальная выдача)
  const FinaleBlock = () => {
    const hasWeights = order.finalWeight || order.finalWeightWithLoss || order.finalToAdd || order.finalToReturn;
    const serviceEt = toEt(order.serviceType);

    return (
      <div className="rr-page">
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '.04em', color: '#2C1F33' }}>VAUGOLD OÜ</div>
        <div className="rr-reg">Reg. nr 16997581 &nbsp;·&nbsp; Tel +372 56662363</div>
        <hr className="rr-hr" />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="rr-num">Nr {order.orderNumber || "—"}</div>
          <div className="rr-date">{fmtDate(order.orderDate)}</div>
        </div>

        {serviceEt && (
          <div style={{ fontSize: 17, color: '#5C4465', marginBottom: 4, marginTop: 2, fontWeight: 500 }}>{serviceEt}</div>
        )}

        {(order.clientName || order.clientPhone) && (
          <>
            <div className="rr-lbl">Klient</div>
            <div className="rr-val">{order.clientName}{order.clientName && order.clientPhone ? " · " : ""}{order.clientPhone}</div>
          </>
        )}

        {order.comment && (
          <>
            <div className="rr-lbl">Märkus</div>
            <div className="rr-comment-box">{order.comment}</div>
          </>
        )}

        <hr className="rr-hr-d" />

        {order.metalGiven && (
          <>
            <div className="rr-lbl">Antud metall</div>
            <div className="rr-val">{order.metalGiven} g{order.withStones && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700 }}>[ KIVIDEGA ]</span>}</div>
          </>
        )}

        {hasWeights && (
          <>
            <div className="rr-lbl" style={{ marginTop: 8 }}>Projekti tulemus</div>
            <div className="rr-metal-grid">
              <div className="rr-metal-cell">
                <div className="rr-metal-cell-label">Lõplik kaal</div>
                <div className="rr-metal-cell-val">{order.finalWeight ? order.finalWeight + " g" : "—"}</div>
              </div>
              <div className="rr-metal-cell">
                <div className="rr-metal-cell-label">Kaal kadudega</div>
                <div className="rr-metal-cell-val">{order.finalWeightWithLoss ? order.finalWeightWithLoss + " g" : "—"}</div>
              </div>
              <div className="rr-metal-cell">
                <div className="rr-metal-cell-label">Juurde lisada</div>
                <div className="rr-metal-cell-val" style={{ color: order.finalToAdd ? "#B03060" : "inherit" }}>{order.finalToAdd ? order.finalToAdd + " g" : "—"}</div>
              </div>
              <div className="rr-metal-cell">
                <div className="rr-metal-cell-label">Tagastada</div>
                <div className="rr-metal-cell-val" style={{ color: order.finalToReturn ? "#2D6B4F" : "inherit" }}>{order.finalToReturn ? order.finalToReturn + " g" : "—"}</div>
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 16, borderTop: "1px dashed #ccc", paddingTop: 12 }}>
          <div style={{ fontSize: 10, color: "#826B87", marginBottom: 6, lineHeight: 1.5 }}>
            Kinnitan, et projekt on teostatud nõuetekohases korras ning toode on tagastatud ja kätte saadud.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginTop: 20 }}>
            <div style={{ flex: 2 }}>
              <div style={{ borderBottom: "1px solid #2C1F33", marginBottom: 4 }} />
              <div style={{ fontSize: 9, color: "#B09AB8" }}>Kliendi allkiri / Signature</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ borderBottom: "1px solid #2C1F33", marginBottom: 4 }} />
              <div style={{ fontSize: 9, color: "#B09AB8" }}>Kuupäev / Date</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <style>{RECEIPT_CSS}</style>

      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Кнопки управления */}
        <div className="flex gap-2 p-4 border-b border-slate-100 bg-slate-50 no-print sticky top-0 z-10">
          <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "client" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`} onClick={() => setMode("client")}>Клиенту</button>
          <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "master" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`} onClick={() => setMode("master")}>Мастеру</button>
          <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "finale" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`} onClick={() => setMode("finale")}>Результат</button>
        </div>

        {/* Тело чека */}
        <div className="rr-wrap">
          {mode === "client" && <ClientBlock />}
          {mode === "master" && <MasterBlock />}
          {mode === "finale" && <FinaleBlock />}
        </div>

        {/* Панель печати */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 mt-auto no-print">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold text-slate-500">Копий:</span>
            <div className="flex gap-2">
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => setCopies(n)} className={`w-8 h-8 rounded-lg font-bold text-sm transition-colors ${copies === n ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm bg-white hover:bg-slate-50 transition-colors">Закрыть</button>
            <button onClick={doPrint} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-md">🖨️ Печать</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderReceipt;