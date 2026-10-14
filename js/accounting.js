// Pure accounting maths (no page code): builds the club's statements from cumulative account balances.
// Layout follows the club's financial statements for the year ended 30 June 2026.
(function () {
  "use strict";
  var INCOME_ORDER = ["Membership & Court Fees", "Fundraising Income", "Donations", "Shop Sales", "Other Income"];
  var EXPENSE_ORDER = ["Salaries", "Coaching Fees", "Repairs & Maintenance", "Utilities", "Bank Charges", "Consumables & Refreshments", "Fundraising Expenses", "Affiliation Fees (Joburg Tennis)", "Reimbursements", "Tennis Balls", "Sundry Expenses", "Advertisements", "Equipment (expensed)", "Cost of Shop Goods Sold", "Stock Adjustments", "Depreciation"];
  var r2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };

  function index(rows) { var m = {}; (rows || []).forEach(function (a) { m[a.code] = a; }); return m; }
  function nat(a) { return !a ? 0 : (a.type === "asset" || a.type === "expense") ? Number(a.debit) - Number(a.credit) : Number(a.credit) - Number(a.debit); }
  function bal(idx, code) { return r2(nat(idx[code])); }
  function diffIdx(to, from, code) { var a = to[code], b = from[code]; if (!a) return 0; var t = nat(a), f = b ? nat(b) : 0; return r2(t - f); }
  function byLine(to, from, type) {
    var out = {};
    Object.keys(to).forEach(function (c) { var a = to[c]; if (a.type !== type) return; var v = diffIdx(to, from, c); if (!v) return; var l = a.stmt_line || a.name; out[l] = r2((out[l] || 0) + v); });
    return out;
  }
  function ordered(map, order) { var keys = order.filter(function (k) { return map[k] != null; }); Object.keys(map).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); return keys.map(function (k) { return [k, map[k]]; }); }
  function sum(arr) { return r2(arr.reduce(function (s, x) { return s + x[1]; }, 0)); }

  // toRows / beforeRows / fyBeforeRows: results of fs_cum() at period end, day before period start, day before the financial year starts
  function statements(toRows, beforeRows, fyBeforeRows) {
    var to = index(toRows), bf = index(beforeRows), fb = index(fyBeforeRows);
    var income = ordered(byLine(to, bf, "revenue"), INCOME_ORDER), expense = ordered(byLine(to, bf, "expense"), EXPENSE_ORDER);
    var totalIncome = sum(income), totalExpense = sum(expense), surplus = r2(totalIncome - totalExpense);
    // balance sheet at period end
    var priorSurplus = r2(Object.keys(fb).reduce(function (s, c) { var a = fb[c]; return a.type === "revenue" ? s + nat(a) : a.type === "expense" ? s - nat(a) : s; }, 0));
    var fyToDate = r2(Object.keys(to).reduce(function (s, c) { var a = to[c]; return a.type === "revenue" ? s + diffIdx(to, fb, c) : a.type === "expense" ? s - diffIdx(to, fb, c) : s; }, 0));
    var cash = r2(bal(to, "1000") + bal(to, "1010")), inv = bal(to, "1400"), rec = bal(to, "1100"), stock = bal(to, "1300"), fa = bal(to, "1200"), ad = r2(-bal(to, "1210"));
    var nbv = r2(fa - ad), totalAssets = r2(cash + inv + rec + stock + nbv);
    var cred = bal(to, "2000"), def = bal(to, "2100"), lg = bal(to, "2200"), totalLiab = r2(cred + def + lg);
    var fund0 = r2(bal(to, "3000") + bal(to, "3900") + priorSurplus), funds = r2(fund0 + fyToDate);
    var bs = { cash: cash, investments: inv, receivables: rec, stock: stock, faCost: fa, accDep: ad, nbv: nbv, totalAssets: totalAssets, creditors: cred, deferred: def, leagueHeld: lg, totalLiab: totalLiab,
      fundOpening: fund0, surplusToDate: fyToDate, funds: funds, totalLiabFunds: r2(totalLiab + funds), check: r2(totalAssets - totalLiab - funds) };
    // cash flow (indirect) for the period
    var d = function (c) { return diffIdx(to, bf, c); };
    var dep = d("5800"), dRec = d("1100"), dStock = d("1300"), dCred = d("2000"), dDef = d("2100"), dLg = d("2200"), dFa = d("1200"), dInv = d("1400");
    var operating = r2(surplus + dep - dRec - dStock + dCred + dDef + dLg), investing = r2(-dFa - dInv), net = r2(operating + investing);
    var open = r2(bal(bf, "1000") + bal(bf, "1010")), close = cash;
    var cf = { surplus: surplus, depreciation: dep, dReceivables: -dRec, dStock: -dStock, dCreditors: dCred, dDeferred: dDef, dLeague: dLg, operating: operating, fa: -dFa, inv: -dInv, investing: investing, net: net, open: open, close: close, check: r2(open + net - close) };
    // trial balance at period end
    var tb = toRows.map(function (a) { var v = Number(a.debit) - Number(a.credit); return { code: a.code, name: a.name, debit: v > 0 ? r2(v) : 0, credit: v < 0 ? r2(-v) : 0 }; }).filter(function (x) { return x.debit || x.credit; });
    var shop = { sales: byLine(to, bf, "revenue")["Shop Sales"] || 0, cogs: byLine(to, bf, "expense")["Cost of Shop Goods Sold"] || 0 };
    shop.gross = r2(shop.sales - shop.cogs);
    return { income: income, expense: expense, totalIncome: totalIncome, totalExpense: totalExpense, surplus: surplus, bs: bs, cf: cf, tb: tb, tbDebit: r2(tb.reduce(function (s, x) { return s + x.debit; }, 0)), tbCredit: r2(tb.reduce(function (s, x) { return s + x.credit; }, 0)), shop: shop };
  }

  // T-accounts for a period: opening (b/d), the period's debits and credits, closing (c/d)
  function taccounts(lines, beforeRows, toRows) {
    var bf = index(beforeRows), to = index(toRows), acc = {};
    lines.forEach(function (l) { (acc[l.code] = acc[l.code] || { code: l.code, name: l.name, dr: [], cr: [] })[Number(l.debit) > 0 ? "dr" : "cr"].push(l); });
    return Object.keys(acc).sort().map(function (c) {
      var a = acc[c], t = to[c], b = bf[c], o = b ? Number(b.debit) - Number(b.credit) : 0, cl = t ? Number(t.debit) - Number(t.credit) : o;
      var drT = a.dr.reduce(function (s, x) { return s + Number(x.debit); }, 0), crT = a.cr.reduce(function (s, x) { return s + Number(x.credit); }, 0);
      return { code: c, name: a.name, opening: r2(o), closing: r2(cl), dr: a.dr, cr: a.cr, drTotal: r2(drT), crTotal: r2(crT) };
    });
  }
  window.KR_ACC = { statements: statements, taccounts: taccounts, r2: r2, INCOME_ORDER: INCOME_ORDER, EXPENSE_ORDER: EXPENSE_ORDER };
})();
