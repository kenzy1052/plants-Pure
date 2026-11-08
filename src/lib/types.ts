export interface ProductImage {
  url: string;
  alt: string | null;
}

export interface Product {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  tagline: string | null;
  description?: string | null;
  flavor_notes?: string[] | null;
  culinary_uses?: string | null;
  ingredients?: string | null;
  price: number;
  compare_at_price: number | null;
  weight_grams: number | null;
  stock: number;
  is_featured: boolean;
  created_at?: string;
  updated_at?: string;
  images: ProductImage[];
  category: { name: string; slug: string } | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  free_over: number | null;
  is_pickup: boolean;
  notes: string | null;
}

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  price: number;
  image: string | null;
  weightGrams: number | null;
  stock: number;
  quantity: number;
}
