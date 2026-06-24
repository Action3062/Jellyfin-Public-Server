import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({
    where: { id: "hd_1m" },
    update: {},
    create: { id: "hd_1m", product: "hd", label: "1 Month", priceEur: 12.99, months: 1, popular: false, icon: "🎬" }
  });
  await prisma.plan.upsert({
    where: { id: "hd_3m" },
    update: {},
    create: { id: "hd_3m", product: "hd", label: "3 Months", priceEur: 34.99, months: 3, popular: false, icon: "🎬" }
  });
  await prisma.plan.upsert({
    where: { id: "hd_12m" },
    update: {},
    create: { id: "hd_12m", product: "hd", label: "Yearly", priceEur: 99.99, months: 12, popular: true, icon: "🎬" }
  });

  for (const option of [
    { product: "hd", eur: 25, days: 53 },
    { product: "hd", eur: 50, days: 106 },
    { product: "hd", eur: 75, days: 159 },
    { product: "hd", eur: 100, days: 335 }
  ]) {
    await prisma.aztecoOption.upsert({
      where: { product_eur: { product: option.product, eur: option.eur } },
      update: {},
      create: option
    });
  }
}

main().finally(() => prisma.$disconnect());
