import { useEffect, useState, useCallback } from "react";
import { firstFreeColor } from "./config/people.js";
import { hashPassword, makeSalt } from "./lib/auth.js";
import {
  loadBills,
  loadMembers,
  saveMembers,
  loadSavedUser,
  saveUser,
  clearUser,
  loadLedgers,
  createLedger,
  joinLedger,
  getLedgerMembers,
  updateMemberId,
  upsertMembers,
  refreshLedger,
  fetchBillsFromServer,
  clearBillsOnServer,
  loadAllBillsLocal,
  BILLS_KEY,
  deleteLedger,
  refreshLedgerListMeta,
} from "./lib/storage.js";
import { safeId } from "./lib/uid.js";
import AuthScreen from "./components/AuthScreen.jsx";
import LedgerSelection from "./components/LedgerSelection.jsx";
import ChatScreen from "./components/ChatScreen.jsx";
import MonthlyTotals from "./components/MonthlyTotals.jsx";

export default function App() {
  const [members, setMembers] = useState(loadMembers);
  const [userId, setUserId] = useState(() => {
    const id = loadSavedUser();
    return id && loadMembers().some((m) => m.id === id) ? id : null;
  });
  const [selectedLedgerId, setSelectedLedgerId] = useState(null);
  const [view, setView] = useState("chat"); // "chat" | "monthlyTotals"
  const [billsVersion, setBillsVersion] = useState(0);
  const [ledgerVersion, setLedgerVersion] = useState(0);

  const bills = selectedLedgerId ? loadBills(selectedLedgerId) : [];
  const refreshBills = useCallback(() => setBillsVersion((v) => v + 1), []);

  useEffect(() => {
    const handler = () => setBillsVersion((v) => v + 1);
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    saveMembers(members);
  }, [members]);

  useEffect(() => {
    if (userId) saveUser(userId);
    else clearUser();
  }, [userId]);

  // Validate userId still exists in members — but don't clear immediately
  // during join/create flows where members may be stale for one render cycle.
  const userExists = userId && members.some((m) => m.id === userId);

  // Reset view when changing ledgers + refresh members from server
  useEffect(() => {
    setView("chat");
    if (selectedLedgerId) {
      refreshLedger(selectedLedgerId).then(() => {
        setMembers(loadMembers());
        setBillsVersion(v => v + 1);
      });
    }
  }, [selectedLedgerId]);

  // Poll server for new bills every 5 seconds while a ledger is open
  useEffect(() => {
    if (!selectedLedgerId) return;
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      const serverBills = await fetchBillsFromServer(selectedLedgerId);
      if (!alive || !serverBills) return;
      // Merge server bills into localStorage (skip duplicates)
      const local = loadAllBillsLocal();
      const localIds = new Set(local.map(b => b.id));
      let changed = false;
      for (const b of serverBills) {
        if (!localIds.has(b.id)) {
          // Ensure timestamps are numbers (server may return strings from PostgreSQL BIGINT)
          if (typeof b.timestamp === 'string') b.timestamp = Number(b.timestamp);
          if (typeof b.amount === 'string') b.amount = Number(b.amount);
          local.push(b);
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(BILLS_KEY, JSON.stringify(local));
        setBillsVersion(v => v + 1);
      }
    };
    poll(); // initial fetch
    const interval = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(interval); };
  }, [selectedLedgerId]);

  const createMember = (name, password) => {
    const clean = name.trim();
    if (members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return null;
    const salt = makeSalt();
    const member = {
      id: safeId("m"),
      name: clean,
      color: firstFreeColor(members.map((m) => m.color)),
      salt,
      passwordHash: hashPassword(password, salt),
      joinedAt: Date.now(),
    };
    setMembers((prev) => [...prev, member]);
    return member;
  };

  const authenticate = (name, password) => {
    const clean = name.trim().toLowerCase();
    const member = members.find((m) => m.name.toLowerCase() === clean);
    if (!member || member.passwordHash !== hashPassword(password, member.salt)) return null;
    return member;
  };

  const handleCreateLedger = async (name) => {
    const result = await createLedger(name, userId, me?.name);
    // Refresh members from localStorage (upsertMembers already wrote there)
    setMembers(loadMembers());
    // If server assigned a different UUID, update session
    if (result.dbUserId && result.dbUserId !== userId) {
      setUserId(result.dbUserId);
    }
    return result.ledger;
  };
  const handleJoinLedger = async (code) => {
    const result = await joinLedger(code, userId, me?.name);
    if (result === null || result === "full") return result;
    // Refresh members from localStorage (upsertMembers already wrote all server members)
    setMembers(loadMembers());
    // If server assigned a different UUID, update session
    if (result.dbUserId && result.dbUserId !== userId) {
      setUserId(result.dbUserId);
    }
    return result.ledger;
  };

  // Background-refresh createdBy for any older local ledgers missing it
  useEffect(() => {
    if (!selectedLedgerId && userId) {
      refreshLedgerListMeta().then(() => {
        setLedgerVersion(v => v + 1);
      });
    }
  }, [selectedLedgerId, userId]);

  // ── Routing ────────────────────────────────────────────────────────

  const me = userId ? members.find((m) => m.id === userId) : null;

  if (!userId || !me) {
    return (
      <AuthScreen
        members={members}
        onSelect={setUserId}
        onCreate={createMember}
        onAuthenticate={authenticate}
      />
    );
  }

  if (!selectedLedgerId) {
    const ledgers = loadLedgers();
    // eslint-disable-next-line no-unused-expressions
    ledgerVersion; // reference so lint doesn't complain — forces re-read after refresh
    return (
      <LedgerSelection
        user={me}
        ledgers={ledgers}
        members={members}
        onSelectLedger={setSelectedLedgerId}
        onCreateLedger={handleCreateLedger}
        onJoinLedger={handleJoinLedger}
        onDeleteLedger={async (ledgerId) => {
          const result = await deleteLedger(ledgerId, userId);
          if (result.ok) {
            // Refresh local state
            setMembers(loadMembers());
            if (selectedLedgerId === ledgerId) setSelectedLedgerId(null);
          }
          return result;
        }}
        onLogout={() => {
          setUserId(null);
          setSelectedLedgerId(null);
        }}
      />
    );
  }

  const ledgers = loadLedgers();
  const currentLedger = ledgers.find((l) => l.id === selectedLedgerId);
  if (!currentLedger) {
    setSelectedLedgerId(null);
    return null;
  }

  const ledgerMembers = getLedgerMembers(currentLedger, members);

  // Monthly Totals view
  if (view === "monthlyTotals") {
    return (
      <MonthlyTotals
        user={me}
        members={ledgerMembers}
        bills={bills}
        onBack={() => setView("chat")}
      />
    );
  }

  // Chat view
  return (
    <ChatScreen
      user={me}
      members={ledgerMembers}
      ledger={currentLedger}
      bills={bills}
      onRefreshBills={refreshBills}
      onBack={() => setSelectedLedgerId(null)}
      onLogout={() => {
        setUserId(null);
        setSelectedLedgerId(null);
      }}
      onClear={() => {
        clearBillsOnServer(selectedLedgerId);
        refreshBills();
      }}
      onMonthlyTotals={() => setView("monthlyTotals")}
    />
  );
}
