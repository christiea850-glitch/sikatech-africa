// server/src/mvp/expectedTotals.ts
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

type DbLike = Pool | PoolConnection;

type PayNowRow = RowDataPacket & { pay_now_sales: string | null };

export async function getPayNowSalesTotal(db: DbLike, shiftId: string) {
  const [rows] = await db.query<PayNowRow[]>(
    `
    SELECT COALESCE(SUM(s.amount), 0) AS pay_now_sales
    FROM sales s
    JOIN payment_methods pm ON pm.id = s.payment_method_id
    WHERE s.cash_desk_shift_id = ?
      AND s.status = 'active'
      AND pm.kind = 'pay_now'
    `,
    [shiftId]
  );

  return Number(rows[0]?.pay_now_sales ?? 0);
}
