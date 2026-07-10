import { PrismaClient } from "@prisma/client";
import { aztecoOptions, defaultPlans } from "../src/data/defaults.js";

const prisma = new PrismaClient();

async function main() {
  for (const plan of defaultPlans) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: { label: plan.label_en, priceEur: plan.price_eur, months: plan.months, popular: plan.popular, icon: plan.icon },
      create: {
        id: plan.id,
        product: plan.product,
        label: plan.label_en,
        priceEur: plan.price_eur,
        months: plan.months,
        popular: plan.popular,
        icon: plan.icon
      }
    });
  }

  for (const option of aztecoOptions.hd) {
    await prisma.aztecoOption.upsert({
      where: { product_eur: { product: "hd", eur: option.eur } },
      update: { days: option.days },
      create: { product: "hd", eur: option.eur, days: option.days }
    });
  }
}

main().finally(() => prisma.$disconnect());
