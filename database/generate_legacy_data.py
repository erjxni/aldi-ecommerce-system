import csv
import random

def generate_messy_csv(filename="database/mock_legacy_users.csv", count=4000):
    print(f"Generating {count} messy legacy records in {filename}...")
    
    first_names = ["John", "Mary", "Robert", "Patricia", "Michael", "Jennifer", "William", "Elizabeth", "David", "Linda", "James", "Barbara", "Joseph", "Susan", "Thomas", "Jessica"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas"]
    
    # Messy date templates
    date_templates = [
        "{month:02d}/{day:02d}/{year}",       # 05/12/2022
        "{year}.{month:02d}.{day:02d}",       # 2023.01.15
        "{year}-{month:02d}-{day:02d}",       # 2022-12-05
        "{day:02d}-{month_name}-{year}"       # 14-Feb-2024
    ]
    
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    # Store generated emails to intentionally inject duplicates later
    emails_generated = []
    
    with open(filename, mode='w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        writer.writerow(["name", "email", "signup_date", "phone"])
        
        for i in range(1, count + 1):
            name = f"{random.choice(first_names)} {random.choice(last_names)}"
            email = f"user_{i}@aldi-legacy.com"
            
            # Formulate a messy date
            year = random.randint(2020, 2025)
            month = random.randint(1, 12)
            day = random.randint(1, 28)
            month_name = month_names[month - 1]
            
            date_fmt = random.choice(date_templates)
            signup_date = date_fmt.format(year=year, month=month, day=day, month_name=month_name)
            
            # Messy phone numbers: some valid, some empty (triggers fallback), some malformed
            phone_choice = random.random()
            if phone_choice < 0.1:
                phone = "" # triggers fallback "Unknown"
            elif phone_choice < 0.2:
                phone = "N/A"
            else:
                phone = f"+61 4{random.randint(10, 99)} {random.randint(100, 999)} {random.randint(100, 999)}"
                
            # Randomly corrupt some rows
            corruption_choice = random.random()
            if corruption_choice < 0.02:
                # Corrupt row: Empty email (raises ValueError, gets logged and skipped)
                email = ""
            elif corruption_choice < 0.04:
                # Corrupt row: Unrecognized date format (raises ValueError, gets logged and skipped)
                signup_date = "messy-date-string"
            
            writer.writerow([name, email, signup_date, phone])
            if email:
                emails_generated.append((name, email, phone))
        
        # Inject duplicates with different signup dates to test deduplication logic
        # Duplicates will keep the latest signup_date in migration
        duplicate_count = int(count * 0.05) # 5% duplicates
        print(f"Injecting {duplicate_count} duplicate email records...")
        
        for _ in range(duplicate_count):
            base_user = random.choice(emails_generated)
            # Create a duplicate entry with a newer or older date
            year = random.randint(2026, 2027) # Ensure newer date
            month = random.choice([1, 2, 3])
            day = random.randint(1, 28)
            signup_date = f"{year}-{month:02d}-{day:02d}" # strict format
            writer.writerow([base_user[0], base_user[1], signup_date, base_user[2]])
            
    print("Generation complete!")

if __name__ == "__main__":
    generate_messy_csv()
