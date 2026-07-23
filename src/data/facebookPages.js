// src/data/facebookPages.js
// Template: copy the object shape below and add one entry per Facebook page.
// Drop the matching logo image into public/logo/ first, then reference its filename here.
//
// category options:
//   'top'          -> shown first, no section label (important/official pages, offices)
//   'Departments'  -> shown under "DEPARTMENTS" heading
//   'Clubs & Organizations' -> shown under "CLUBS & ORGANIZATIONS" heading

const facebookPages = [
  {
    id: 'nbsc-main',
    name: 'Northern Bukidnon State College',
    url: 'https://www.facebook.com/NorthernBukidnonStateCollegeOfficial',
    logo: '/logo/nbsclogo.png',
    category: 'top',
  },
  {
    id: 'nbsc-aso',
    name: 'Northern Bukidnon State College Admission & Scholarship Office',
    url: 'https://www.facebook.com/NBSCAdmissionScholarshipOffice',
    logo: '/logo/nbscaso.png',
    category: 'top',
  },

  {
    id: 'ibm',
    name: 'Institute for Business Management',
    url: 'https://www.facebook.com/example-ibm',
    logo: '/logo/ibm.png',
    category: 'Departments',
  },
  {
    id: 'ics',
    name: 'Institute for Computer Studies',
    url: 'https://www.facebook.com/example-ics',
    logo: '/logo/ics.png',
    category: 'Departments',
  },
  {
    id: 'ite',
    name: 'Institute for Teacher Education',
    url: 'https://www.facebook.com/example-ite',
    logo: '/logo/ite.png',
    category: 'Departments',
  },

  // {
  //   id: 'unique-id-here',
  //   name: 'Club or Org Name',
  //   url: 'https://www.facebook.com/...',
  //   logo: '/logo/filename.png',
  //   category: 'Clubs & Organizations',
  // },

  // 👇 Copy this block for each new page, then edit the values:
  // {
  //   id: 'unique-id-here',
  //   name: 'Page Name Here',
  //   url: 'https://www.facebook.com/...',
  //   logo: '/logo/filename.png',
  //   category: 'top', // or 'Departments', 'Clubs & Organizations'
  // },
]

export default facebookPages