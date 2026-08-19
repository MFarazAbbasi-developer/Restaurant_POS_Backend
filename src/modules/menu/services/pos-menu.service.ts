import { prisma } from '../../../config/database.js';

export class PosMenuService {
  /**
   * Retrieves the complete, pre-sorted, active menu structure optimized for POS terminals.
   * Excludes inactive categories, inactive/unavailable items, inactive variants, and inactive modifiers.
   */
  public static async getPosMenu(restaurantId: string) {
    const categories = await prisma.category.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
      include: {
        menuItems: {
          where: {
            isActive: true,
            isAvailable: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
          include: {
            variants: {
              where: {
                isActive: true,
              },
              orderBy: {
                sortOrder: 'asc',
              },
            },
            modifierGroups: {
              where: {
                modifierGroup: {
                  isActive: true,
                },
              },
              orderBy: {
                sortOrder: 'asc',
              },
              include: {
                modifierGroup: {
                  include: {
                    modifiers: {
                      where: {
                        isActive: true,
                      },
                      orderBy: {
                        sortOrder: 'asc',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Clean up structure for POS consumption
    const formattedCategories = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      items: category.menuItems.map((item) => ({
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        urduName: item.urduName,
        description: item.description,
        basePrice: item.basePrice.toNumber(),
        taxRate: item.taxRate ? item.taxRate.toNumber() : null,
        sortOrder: item.sortOrder,
        variants: item.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price.toNumber(),
          sortOrder: variant.sortOrder,
        })),
        modifierGroups: item.modifierGroups.map((link) => ({
          id: link.modifierGroup.id,
          name: link.modifierGroup.name,
          selectionType: link.modifierGroup.selectionType,
          minSelections: link.minSelections ?? link.modifierGroup.minSelections,
          maxSelections: link.maxSelections ?? link.modifierGroup.maxSelections,
          isRequired: link.isRequired,
          sortOrder: link.sortOrder,
          modifiers: link.modifierGroup.modifiers.map((modifier) => ({
            id: modifier.id,
            name: modifier.name,
            priceAdjustment: modifier.priceAdjustment.toNumber(),
            sortOrder: modifier.sortOrder,
          })),
        })),
      })),
    }));

    return {
      restaurantId,
      categories: formattedCategories,
    };
  }
}
