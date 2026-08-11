const { query, queryOne, run } = require('../config/database');

const ExpenditureModel = {
    async create({ business_id, cashier_id, amount, description, expense_date = null }) {
        const amt = parseFloat(amount);
        const pad = n => String(n).padStart(2, '0');
        const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
        const date = expense_date || localToday();
        const result = await run(
            `INSERT INTO expenditures (business_id, cashier_id, amount, description, expense_date)
       VALUES (?,?,?,?,?)`,
            [business_id, cashier_id, amt, description, date]
        );
        return this.getById(result.insertId, business_id);
    },

    async getById(id, business_id) {
        return queryOne(
            `SELECT e.*, u.name AS cashier_name
       FROM expenditures e
       JOIN users u ON u.id = e.cashier_id
       WHERE e.id=? AND e.business_id=?`,
            [id, business_id]
        );
    },

    async getAll(business_id, { cashier_id, date_from, date_to, limit = 100, offset = 0 } = {}) {
        let where = 'WHERE e.business_id=?'; const p = [business_id];
        if (cashier_id) { where += ' AND e.cashier_id=?'; p.push(cashier_id); }
        if (date_from) { where += ' AND e.expense_date>=?'; p.push(date_from); }
        if (date_to) { where += ' AND e.expense_date<=?'; p.push(date_to); }

        const rows = await query(
            `SELECT e.*, u.name AS cashier_name
       FROM expenditures e
       JOIN users u ON u.id = e.cashier_id
       ${where}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT ? OFFSET ?`,
            [...p, parseInt(limit), parseInt(offset)]
        );

        const totalRow = await queryOne(
            `SELECT COUNT(*) AS cnt, COALESCE(SUM(e.amount),0) AS total
       FROM expenditures e ${where}`,
            p
        );

        return { rows, total: totalRow.cnt, total_amount: +parseFloat(totalRow.total).toFixed(2) };
    },

    // Per-day totals for a date range — used to reduce that day's profit in analytics/daily
    async getDailyTotals(business_id, { date_from, date_to } = {}) {
        let where = 'WHERE business_id=?'; const p = [business_id];
        if (date_from) { where += ' AND expense_date>=?'; p.push(date_from); }
        if (date_to) { where += ' AND expense_date<=?'; p.push(date_to); }
        return query(
            `SELECT expense_date, SUM(amount) AS total
       FROM expenditures ${where}
       GROUP BY expense_date`,
            p
        );
    },

    // Cashiers may delete only their own same-day entries (fixing a mistake);
    // admins/managers may delete any. Enforced by the caller passing the right ids.
    async delete(id, business_id, { cashier_id = null } = {}) {
        let sql = 'DELETE FROM expenditures WHERE id=? AND business_id=?';
        const p = [id, business_id];
        if (cashier_id) { sql += ' AND cashier_id=?'; p.push(cashier_id); }
        return run(sql, p);
    }
};

module.exports = ExpenditureModel;
